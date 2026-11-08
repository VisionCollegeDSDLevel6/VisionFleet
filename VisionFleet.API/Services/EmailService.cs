
using System;
using System.Diagnostics;
using System.Net;
using System.Net.Mail;

namespace VisionFleet.API.Services
{
    public class EmailService
    {
        private readonly IConfiguration _configuration;

        public EmailService(IConfiguration configuration)
        {
            _configuration = configuration;
        }

        // =====================================
        // Send email using Gmail SMTP
        // =====================================
        public async Task SendEmailAsync(
            string recipientEmail,
            string subject,
            string message)
        {
            string senderEmail =
                _configuration["Smtp:Email"]
                ?? throw new Exception(
                    "SMTP email is not configured.");

            string appPassword =
                _configuration["Smtp:AppPassword"]
                ?? throw new Exception(
                    "SMTP password is not configured.");

            using var mail = new MailMessage();

            mail.From = new MailAddress(
                senderEmail,
                "Vision Fleet");

            mail.To.Add(recipientEmail);

            mail.Subject = subject;
            mail.Body = message;
            mail.IsBodyHtml = false;

            using var smtp = new SmtpClient(
                "smtp.gmail.com",
                587);

            smtp.EnableSsl = true;
            smtp.UseDefaultCredentials = false;

            smtp.Credentials = new NetworkCredential(
                senderEmail,
                appPassword);

            try
            {
                await smtp.SendMailAsync(mail);

                Debug.WriteLine(
                    "Vision Fleet: Email sent successfully.");
            }
            catch (SmtpException ex)
            {
                string errorDetails =
                    "VISION FLEET SMTP ERROR\n" +
                    "Status Code: " + ex.StatusCode + "\n" +
                    "Message: " + ex.Message + "\n" +
                    "Inner Exception: " +
                    (ex.InnerException?.Message ?? "None");

                Debug.WriteLine(errorDetails);

                Console.Error.WriteLine(errorDetails);

                throw;
            }
            catch (Exception ex)
            {
                Debug.WriteLine(
                    "VISION FLEET EMAIL ERROR: " +
                    ex.Message);

                Console.Error.WriteLine(
                    "VISION FLEET EMAIL ERROR: " +
                    ex.Message);

                throw;
            }
        }
    }
}
