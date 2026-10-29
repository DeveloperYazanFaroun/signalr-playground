using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using RealTime.Api.Contracts;

namespace RealTime.Api.Auth;

/// <summary>
/// DEV-ONLY token issuer so trainees can log in with just a user name.
/// In CareConnect the token comes from the Identity service; the hub side is identical.
/// </summary>
public sealed class TokenService(IConfiguration config)
{
    public static SymmetricSecurityKey KeyFrom(IConfiguration config) =>
        new(Encoding.UTF8.GetBytes(config["Jwt:SigningKey"]!));

    public TokenResponse Issue(string userName)
    {
        var expires = DateTimeOffset.UtcNow.AddHours(8);

        var descriptor = new SecurityTokenDescriptor
        {
            Issuer = config["Jwt:Issuer"],
            Audience = config["Jwt:Audience"],
            Expires = expires.UtcDateTime,
            Subject = new ClaimsIdentity(
            [
                new Claim(JwtRegisteredClaimNames.Sub, userName),
                new Claim(JwtRegisteredClaimNames.Name, userName),
                new Claim("role", userName.Equals("admin", StringComparison.OrdinalIgnoreCase) ? "Admin" : "User"),
            ]),
            SigningCredentials = new SigningCredentials(KeyFrom(config), SecurityAlgorithms.HmacSha256),
        };

        var token = new JsonWebTokenHandler().CreateToken(descriptor);
        return new TokenResponse(token, userName, expires);
    }
}
