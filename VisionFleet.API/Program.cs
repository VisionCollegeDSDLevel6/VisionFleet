
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;
using VisionFleet.API.Data;
using VisionFleet.API.Models;
using VisionFleet.API.Services;

var builder = WebApplication.CreateBuilder(args);

// =====================================
// Database
// =====================================
builder.Services.AddDbContext<VisionFleetDbContext>(
    options => options.UseSqlServer(
        builder.Configuration.GetConnectionString(
            "DefaultConnection")
    )
);

// =====================================
// Cookie Authentication
// =====================================
builder.Services
    .AddAuthentication(
        CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.Cookie.Name = "VisionFleet.Auth";
        options.Cookie.HttpOnly = true;

        options.Cookie.SecurePolicy =
            CookieSecurePolicy.Always;

        options.Cookie.SameSite = SameSiteMode.Lax;

        options.ExpireTimeSpan =
            TimeSpan.FromHours(8);

        options.SlidingExpiration = true;

        options.Events.OnRedirectToLogin = context =>
        {
            context.Response.StatusCode = 401;
            return Task.CompletedTask;
        };

        options.Events.OnRedirectToAccessDenied = context =>
        {
            context.Response.StatusCode = 403;
            return Task.CompletedTask;
        };
    });

// =====================================
// Authorization
// =====================================
builder.Services.AddAuthorization();

// =====================================
// CSRF Configuration
// =====================================
builder.Services.AddAntiforgery(options =>
{
    options.HeaderName = "X-CSRF-TOKEN";

    options.Cookie.Name = "VisionFleet.Csrf";
    options.Cookie.HttpOnly = true;

    options.Cookie.SecurePolicy =
        CookieSecurePolicy.Always;

    options.Cookie.SameSite = SameSiteMode.Lax;
});

// =====================================
// Password Hasher
// =====================================
builder.Services.AddScoped<
    IPasswordHasher<User>,
    PasswordHasher<User>>();

// =====================================
// Email Service
// =====================================
builder.Services.AddScoped<EmailService>();

// =====================================
// CORS - React Frontend
// =====================================
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy
            .WithOrigins("http://localhost:5173")
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

// =====================================
// Controllers with CSRF Validation
// =====================================
builder.Services.AddControllersWithViews(options =>
{
    options.Filters.Add(
        new AutoValidateAntiforgeryTokenAttribute());
});

// =====================================
// OpenAPI
// =====================================
builder.Services.AddOpenApi();

var app = builder.Build();

// =====================================
// Development
// =====================================
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

// =====================================
// Middleware
// =====================================
app.UseHttpsRedirection();

app.UseCors("AllowFrontend");

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();
