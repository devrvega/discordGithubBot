# Discord GitHub Bot

A Discord bot that sends notifications to your Discord server whenever issues or pull requests are opened or closed in your GitHub repositories.

## Features

- Notifies when issues are opened or closed
- Notifies when pull requests are opened or closed
- Supports multiple repositories
- Configurable Discord channels per repository
- Hosted on AWS Lambda
- Uses DynamoDB for configuration storage
- Secure token storage using AWS Secrets Manager

## Prerequisites

- Node.js 18.x or later
- AWS Account with appropriate permissions
- Discord Bot Token
- GitHub Account with repository access

## Setup Instructions

### 1. Create a Discord Bot

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give it a name
3. Go to the "Bot" section and click "Add Bot"
4. Copy the bot token (you'll need this later)
5. Enable the following bot intents:
   - Presence Intent
   - Server Members Intent
   - Message Content Intent

### 2. AWS Setup

1. Create a DynamoDB table:
   ```bash
   aws dynamodb create-table \
     --table-name github-webhook-config \
     --attribute-definitions AttributeName=repoName,AttributeType=S \
     --key-schema AttributeName=repoName,KeyType=HASH \
     --provisioned-throughput ReadCapacityUnits=5,WriteCapacityUnits=5
   ```

2. Create a secret in AWS Secrets Manager:
   ```bash
   aws secretsmanager create-secret \
     --name discord-bot-token \
     --secret-string '{"discordToken":"your-discord-bot-token"}'
   ```

3. Create an IAM role for the Lambda function with the following permissions:
   - AWSLambdaBasicExecutionRole
   - DynamoDB read access to the github-webhook-config table
   - Secrets Manager read access to the discord-bot-token secret

4. Create an API Gateway endpoint:
   - Create a new REST API
   - Create a POST method
   - Enable CORS
   - Deploy the API

5. Create a Lambda function:
   - Runtime: Node.js 18.x
   - Handler: dist/index.handler
   - Environment variables:
     - CONFIG_TABLE_NAME: github-webhook-config
     - DISCORD_TOKEN_SECRET_NAME: discord-bot-token

### 3. GitHub Webhook Setup

1. Go to your GitHub repository settings
2. Navigate to Webhooks
3. Click "Add webhook"
4. Set the Payload URL to your API Gateway endpoint
5. Set Content type to application/json
6. Select the following events:
   - Issues
   - Pull requests
7. Save the webhook

### 4. Configuration

Add your repository configuration to DynamoDB:

```bash
aws dynamodb put-item \
  --table-name github-webhook-config \
  --item '{
    "repoName": {"S": "your-username/your-repo"},
    "channelId": {"S": "your-discord-channel-id"}
  }'
```

### 5. Deployment

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build the project:
   ```bash
   npm run build
   ```

3. Create a ZIP file containing:
   - dist/index.js
   - node_modules/
   - package.json

4. Upload the ZIP file to your Lambda function

## Usage

Once set up, the bot will automatically:
- Send a message when an issue is opened or closed
- Send a message when a pull request is opened or closed
- Include relevant information like title, author, and URL

## Security Considerations

- Discord token is stored securely in AWS Secrets Manager
- DynamoDB only stores non-sensitive configuration data
- Use IAM roles with minimal required permissions
- Enable API Gateway authentication if needed
- Consider implementing webhook signature verification

## Troubleshooting

1. Check CloudWatch logs for Lambda function errors
2. Verify DynamoDB table permissions
3. Ensure Discord bot has proper permissions in the server
4. Verify GitHub webhook is properly configured
5. Check API Gateway logs for any issues
6. Verify Secrets Manager permissions and secret exists

## Contributing

Feel free to submit issues and enhancement requests! 