package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/ses"
	"github.com/aws/aws-sdk-go-v2/service/ses/types"
)

type EmailService struct {
	client *ses.Client
}

func NewEmailService(ctx context.Context) (*EmailService, error) {
	cfg, err := config.LoadDefaultConfig(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to load AWS config: %w", err)
	}

	return &EmailService{
		client: ses.NewFromConfig(cfg),
	}, nil
}

func (e *EmailService) SendSimpleEmail(ctx context.Context, from, to, subject, body string) error {
	input := &ses.SendEmailInput{
		Source: &from,
		Destination: &types.Destination{
			ToAddresses: []string{to},
		},
		Message: &types.Message{
			Subject: &types.Content{
				Data: &subject,
			},
			Body: &types.Body{
				Text: &types.Content{
					Data: &body,
				},
			},
		},
	}

	result, err := e.client.SendEmail(ctx, input)
	if err != nil {
		return fmt.Errorf("failed to send email: %w", err)
	}

	fmt.Printf("Email sent successfully! Message ID: %s\n", *result.MessageId)
	return nil
}

func (e *EmailService) SendHTMLEmail(ctx context.Context, from, to, subject, htmlBody, textBody string) error {
	input := &ses.SendEmailInput{
		Source: &from,
		Destination: &types.Destination{
			ToAddresses: []string{to},
		},
		Message: &types.Message{
			Subject: &types.Content{
				Data: &subject,
			},
			Body: &types.Body{
				Html: &types.Content{
					Data: &htmlBody,
				},
				Text: &types.Content{
					Data: &textBody,
				},
			},
		},
	}

	result, err := e.client.SendEmail(ctx, input)
	if err != nil {
		return fmt.Errorf("failed to send HTML email: %w", err)
	}

	fmt.Printf("HTML email sent successfully! Message ID: %s\n", *result.MessageId)
	return nil
}

func (e *EmailService) ListVerifiedEmailAddresses(ctx context.Context) error {
	result, err := e.client.ListVerifiedEmailAddresses(ctx, &ses.ListVerifiedEmailAddressesInput{})
	if err != nil {
		return fmt.Errorf("failed to list verified email addresses: %w", err)
	}

	fmt.Println("Verified email addresses:")
	for _, email := range result.VerifiedEmailAddresses {
		fmt.Printf("  - %s\n", email)
	}

	return nil
}

func (e *EmailService) GetSendQuota(ctx context.Context) error {
	result, err := e.client.GetSendQuota(ctx, &ses.GetSendQuotaInput{})
	if err != nil {
		return fmt.Errorf("failed to get send quota: %w", err)
	}

	fmt.Printf("Send quota information:\n")
	fmt.Printf("  Max 24 Hour Send: %.0f\n", result.Max24HourSend)
	fmt.Printf("  Max Send Rate: %.2f emails per second\n", result.MaxSendRate)
	fmt.Printf("  Sent Last 24 Hours: %.0f\n", result.SentLast24Hours)

	return nil
}

func (e *EmailService) GetSendStatistics(ctx context.Context) error {
	result, err := e.client.GetSendStatistics(ctx, &ses.GetSendStatisticsInput{})
	if err != nil {
		return fmt.Errorf("failed to get send statistics: %w", err)
	}

	fmt.Println("Send statistics (last 15 minutes intervals):")
	for _, stat := range result.SendDataPoints {
		fmt.Printf("  Timestamp: %v\n", stat.Timestamp)
		fmt.Printf("    Delivery Attempts: %d\n", stat.DeliveryAttempts)
		fmt.Printf("    Bounces: %d\n", stat.Bounces)
		fmt.Printf("    Complaints: %d\n", stat.Complaints)
		fmt.Printf("    Rejects: %d\n", stat.Rejects)
		fmt.Println("    ---")
	}

	return nil
}

func main() {
	ctx := context.Background()

	emailService, err := NewEmailService(ctx)
	if err != nil {
		log.Fatalf("Failed to create email service: %v", err)
	}

	fromEmail := os.Getenv("FROM_EMAIL")
	toEmail := os.Getenv("TO_EMAIL")

	if fromEmail == "" || toEmail == "" {
		fmt.Println("Please set FROM_EMAIL and TO_EMAIL environment variables")
		fmt.Println("\nExample usage:")
		fmt.Println("export FROM_EMAIL=sender@example.com")
		fmt.Println("export TO_EMAIL=recipient@example.com")
		fmt.Println("go run main.go")
		fmt.Println("\nAvailable operations:")
		fmt.Println("- Send simple text email")
		fmt.Println("- Send HTML email with text fallback")
		fmt.Println("- List verified email addresses")
		fmt.Println("- Get send quota information")
		fmt.Println("- Get send statistics")
		return
	}

	operation := os.Getenv("OPERATION")
	if operation == "" {
		operation = "simple"
	}

	switch operation {
	case "simple":
		subject := "Test Email from AWS SES Go Demo"
		body := `Hello from AWS SES!

This is a test email sent using the AWS SDK for Go v2.

The demo application showcases various SES operations:
- Sending simple text emails
- Sending HTML emails
- Listing verified email addresses
- Getting send quota and statistics

Best regards,
AWS SES Go Demo`

		if err := emailService.SendSimpleEmail(ctx, fromEmail, toEmail, subject, body); err != nil {
			log.Fatalf("Failed to send simple email: %v", err)
		}

	case "html":
		subject := "HTML Test Email from AWS SES Go Demo"
		htmlBody := `<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background-color: #f0f0f0; padding: 20px; border-radius: 5px; }
        .content { margin: 20px 0; }
        .footer { font-size: 12px; color: #666; margin-top: 30px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🚀 AWS SES Go Demo</h1>
        <p>This is an HTML email sent using AWS SES with Go!</p>
    </div>

    <div class="content">
        <h2>Features Demonstrated:</h2>
        <ul>
            <li>✅ Sending simple text emails</li>
            <li>✅ Sending rich HTML emails</li>
            <li>✅ Listing verified email addresses</li>
            <li>✅ Getting send quota and statistics</li>
        </ul>

        <p>This email demonstrates the HTML formatting capabilities of AWS SES.</p>
    </div>

    <div class="footer">
        <p>Sent via AWS SES Go Demo Application</p>
    </div>
</body>
</html>`

		textBody := `AWS SES Go Demo

This is an HTML email sent using AWS SES with Go!

Features Demonstrated:
- Sending simple text emails
- Sending rich HTML emails
- Listing verified email addresses
- Getting send quota and statistics

This email demonstrates the HTML formatting capabilities of AWS SES.

Sent via AWS SES Go Demo Application`

		if err := emailService.SendHTMLEmail(ctx, fromEmail, toEmail, subject, htmlBody, textBody); err != nil {
			log.Fatalf("Failed to send HTML email: %v", err)
		}

	case "list":
		if err := emailService.ListVerifiedEmailAddresses(ctx); err != nil {
			log.Fatalf("Failed to list verified email addresses: %v", err)
		}

	case "quota":
		if err := emailService.GetSendQuota(ctx); err != nil {
			log.Fatalf("Failed to get send quota: %v", err)
		}

	case "stats":
		if err := emailService.GetSendStatistics(ctx); err != nil {
			log.Fatalf("Failed to get send statistics: %v", err)
		}

	default:
		fmt.Printf("Unknown operation: %s\n", operation)
		fmt.Println("Available operations: simple, html, list, quota, stats")
		return
	}
}