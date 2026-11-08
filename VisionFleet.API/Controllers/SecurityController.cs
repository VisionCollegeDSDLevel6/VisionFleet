
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Mvc;

namespace VisionFleet.API.Controllers
{
    [Route("api/security")]
    [ApiController]
    public class SecurityController : ControllerBase
    {
        private readonly IAntiforgery _antiforgery;

        public SecurityController(
            IAntiforgery antiforgery)
        {
            _antiforgery = antiforgery;
        }

        // =====================================
        // GET: api/security/csrf-token
        // Get a CSRF token for frontend requests
        // =====================================
        [HttpGet("csrf-token")]
        public IActionResult GetCsrfToken()
        {
            Response.Headers.CacheControl = "no-store";

            var tokens = _antiforgery.GetAndStoreTokens(
                HttpContext);

            return Ok(new
            {
                csrfToken = tokens.RequestToken
            });
        }
    }
}
