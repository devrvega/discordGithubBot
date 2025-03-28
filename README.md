# Discord GitHub Bot

A Discord bot that sends notifications to your Discord server whenever issues or pull requests are opened or closed in your GitHub repositories.

## Features

- Notifies when issues are opened or closed
- Notifies when pull requests are opened or closed
- Supports multiple repositories
- Configurable Discord channels per repository
- Hosted on AWS Lambda
- Secure configuration storage using AWS Secrets Manager

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

1. Create a secret in AWS Secrets Manager with the following structure:
   ```json
   {
     "discordToken": "your-discord-bot-token",
     "repositories": {
       "username/repo-name": {
         "channelId": "your-discord-channel-id"
       },
       "username/another-repo": {
         "channelId": "another-discord-channel-id"
       }
     }
   }
   ```

   You can create it using the AWS CLI:
   ```bash
   aws secretsmanager create-secret \
     --name github-discord-config \
     --secret-string '{
       "discordToken": "your-discord-bot-token",
       "repositories": {
         "username/repo-name": {
           "channelId": "your-discord-channel-id"
         }
       }
     }'
   ```

2. Create an IAM role for the Lambda function with the following permissions:
   - AWSLambdaBasicExecutionRole
   - Secrets Manager read access to the github-discord-config secret

3. Create an API Gateway endpoint:
   - Create a new REST API
   - Create a POST method
   - Enable CORS
   - Deploy the API

4. Create a Lambda function:
   - Runtime: Node.js 18.x
   - Handler: dist/index.handler
   - Environment variables:
     - CONFIG_SECRET_NAME: github-discord-config

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

### 4. Deployment

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

- All configuration is stored securely in AWS Secrets Manager
- Use IAM roles with minimal required permissions
- Enable API Gateway authentication if needed
- Consider implementing webhook signature verification

## Troubleshooting

1. Check CloudWatch logs for Lambda function errors
2. Verify Secrets Manager permissions and secret exists
3. Ensure Discord bot has proper permissions in the server
4. Verify GitHub webhook is properly configured
5. Check API Gateway logs for any issues

## Contributing

Feel free to submit issues and enhancement requests! 