import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import OpenAI from "openai";

// Initialize DynamoDB and OpenAI clients
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const openai = new OpenAI({
  apiKey: process.env.OPENAI, // Ensure this matches the environment variable name in AWS Lambda
});

export const handler = async (event) => {
  try {
    const { email, url } = JSON.parse(event.body);
    if (!email || !url) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Email and URL are required" }),
      };
    }

    // Fetch existing entry from DynamoDB
    const getParams = {
      TableName: "unihack", // Replace with your table name
      Key: { PK: email, SK: 0 },
    };
    const existingEntry = await docClient.send(new GetCommand(getParams));
    if (!existingEntry.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "No matching entry found" }),
      };
    }

    // Create the prompt for OpenAI
    const prompt = `The current task at hand is: ${existingEntry.Item.prompt}. Is this URL (${url}) related to the task? Reply with one word, which is a boolean value (true or false).`;

    // Call OpenAI API
    const openAIResponse = await openai.chat.completions.create({
      model: "gpt-4", // Ensure you have access to GPT-4
      messages: [{ role: "user", content: prompt }],
      max_tokens: 10,
    });

    // Extract the AI's response
    const aiOutput = openAIResponse.choices?.[0]?.message?.content?.trim() || "No response";

    // add regex checkfor boolean value and change output to boolean var
    const regex = new RegExp("[tT][rR][uU][eE]");
    let isRelated = false; // Use let instead of const
    if (regex.test(aiOutput)) {
        isRelated = true;
    }

    // Store new entry in DynamoDB for url_checked
    const putParams = {
      TableName: "unihack", // Replace with your table name
      Item: {
        PK: email,
        SK: Math.floor(Date.now() / 1000), // Use current timestamp as the sort key
        isRelated: isRelated,
      },
    };
    await docClient.send(new PutCommand(putParams));

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "AI response stored successfully", aiOutput }),
    };
  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Error processing request", error: error.message }),
    };
  }
};