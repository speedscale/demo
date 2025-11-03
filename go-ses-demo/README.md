# AWS SES Go Demo

A complete Go demonstration application showcasing AWS Simple Email Service (SES) functionality using the AWS SDK for Go v2.

## Features

- ✅ Send simple text emails
- ✅ Send rich HTML emails with text fallback
- ✅ List verified email addresses
- ✅ Get send quota information
- ✅ Get send statistics
- ✅ Comprehensive error handling
- ✅ Environment-based configuration

## Prerequisites

1. **AWS Account**: You need an AWS account with SES access
2. **Verified Email Addresses**: Both sender and recipient email addresses must be verified in SES (unless you're out of the SES sandbox)
3. **AWS Credentials**: Configure your AWS credentials using one of these methods:
   - AWS CLI: `aws configure`
   - Environment variables: `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`
   - IAM roles (if running on EC2)
   - AWS credentials file

## Installation

1. Clone or download this demo:
   ```bash
   git clone <repository-url>
   cd go-ses-demo
   ```

2. Install dependencies:
   ```bash
   go mod tidy
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your actual values
   ```

## Configuration

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `AWS_REGION` | AWS region where SES is configured | No | `us-east-1` |
| `AWS_ACCESS_KEY_ID` | AWS access key ID | Yes* | - |
| `AWS_SECRET_ACCESS_KEY` | AWS secret access key | Yes* | - |
| `FROM_EMAIL` | Verified sender email address | Yes | - |
| `TO_EMAIL` | Recipient email address | Yes | - |
| `OPERATION` | Operation to perform | No | `simple` |

*Required if not using other AWS credential methods

### Operations

| Operation | Description |
|-----------|-------------|
| `simple` | Send a simple text email |
| `html` | Send an HTML email with text fallback |
| `list` | List all verified email addresses |
| `quota` | Show send quota information |
| `stats` | Show send statistics |

## Usage

### Basic Usage

```bash
# Set required environment variables
export FROM_EMAIL=sender@example.com
export TO_EMAIL=recipient@example.com

# Run the demo
go run .
```

### Send Different Types of Emails

```bash
# Send simple text email (default)
export OPERATION=simple
go run .

# Send HTML email
export OPERATION=html
go run .
```

### Check SES Information

```bash
# List verified email addresses
export OPERATION=list
go run .

# Check send quota
export OPERATION=quota
go run .

# View send statistics
export OPERATION=stats
go run .
```

### Using Environment File

```bash
# Copy and edit the example environment file
cp .env.example .env
# Edit .env with your values

# Source the environment file and run
source .env && go run .
```

## Example Output

### Simple Email
```
Email sent successfully! Message ID: 0000014a-f4d4-4f89-93b2-4c9d5example
```

### HTML Email
```
HTML email sent successfully! Message ID: 0000014a-f4d4-4f89-93b2-4c9d5example
```

### List Verified Emails
```
Verified email addresses:
  - sender@example.com
  - another@example.com
```

### Send Quota
```
Send quota information:
  Max 24 Hour Send: 200
  Max Send Rate: 1.00 emails per second
  Sent Last 24 Hours: 5
```

## SES Setup Requirements

### 1. Verify Email Addresses

Before sending emails, you must verify your email addresses in the AWS SES console:

1. Go to AWS SES Console
2. Navigate to "Verified identities"
3. Click "Create identity"
4. Add your sender email address
5. Check your email and click the verification link

### 2. Request Production Access (Optional)

By default, SES accounts are in sandbox mode with limitations:
- Can only send to verified email addresses
- Limited sending quota

To send to unverified addresses, request production access in the SES console.

### 3. Configure DNS (For Domain Verification)

If using domain verification instead of individual email verification:
1. Verify your domain in SES console
2. Add the required DNS records (TXT, CNAME, MX)
3. Wait for verification to complete

## Troubleshooting

### Common Issues

1. **"Email address not verified"**
   - Ensure both sender and recipient emails are verified in SES console
   - Check if you're in SES sandbox mode

2. **"Access denied"**
   - Verify AWS credentials are configured correctly
   - Check IAM permissions include SES actions

3. **"Region not supported"**
   - Ensure you're using a region where SES is available
   - Common SES regions: us-east-1, us-west-2, eu-west-1

4. **"Rate exceeded"**
   - You've hit your sending rate limit
   - Check quota with `OPERATION=quota`
   - Consider requesting limit increase

### Required IAM Permissions

Your AWS user/role needs these SES permissions:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "ses:SendEmail",
                "ses:SendRawEmail",
                "ses:ListVerifiedEmailAddresses",
                "ses:GetSendQuota",
                "ses:GetSendStatistics"
            ],
            "Resource": "*"
        }
    ]
}
```

## Code Structure

- `main.go` - Main application with EmailService implementation
- `config.go` - Configuration management
- `.env.example` - Example environment variables
- `go.mod` - Go module definition with AWS SDK dependencies

## Dependencies

- `github.com/aws/aws-sdk-go-v2/config` - AWS SDK configuration
- `github.com/aws/aws-sdk-go-v2/service/ses` - AWS SES service client

## Contributing

Feel free to submit issues and enhancement requests!

## License

This demo is provided as-is for educational purposes.