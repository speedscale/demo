import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import javax.crypto.SecretKey;
import java.util.Date;

/**
 * Standalone JWT Generator for java-auth service
 * 
 * Compile: javac -cp ".:jjwt-api-0.12.3.jar:jjwt-impl-0.12.3.jar:jjwt-jackson-0.12.3.jar:jackson-databind-2.15.2.jar:jackson-core-2.15.2.jar:jackson-annotations-2.15.2.jar" JwtGenerator.java
 * Run: java -cp ".:jjwt-api-0.12.3.jar:jjwt-impl-0.12.3.jar:jjwt-jackson-0.12.3.jar:jackson-databind-2.15.2.jar:jackson-core-2.15.2.jar:jackson-annotations-2.15.2.jar" JwtGenerator <username> [secret] [expiration_ms]
 */
public class JwtGenerator {
    
    public static void main(String[] args) {
        if (args.length < 1) {
            System.err.println("Usage: java JwtGenerator <username> [jwt_secret] [expiration_ms]");
            System.err.println("Example: java JwtGenerator admin");
            System.err.println("Example: java JwtGenerator admin your-secret-key 3600000");
            System.exit(1);
        }
        
        String username = args[0];
        String jwtSecret = args.length > 1 ? args[1] : "your-secret-key-here-please-change-in-production";
        long expirationMs = args.length > 2 ? Long.parseLong(args[2]) : 3600000L; // Default 1 hour
        
        String token = generateToken(username, jwtSecret, expirationMs);
        
        System.out.println("Generated JWT token for user: " + username);
        System.out.println("Secret used: " + jwtSecret);
        System.out.println("Valid for: " + (expirationMs / 1000 / 60) + " minutes");
        System.out.println();
        System.out.println("Token:");
        System.out.println(token);
        System.out.println();
        System.out.println("To verify this token, you can use:");
        System.out.println("curl -X POST http://localhost:8080/api/auth/validate -H 'Content-Type: application/json' -d '{\"token\":\"" + token + "\"}'");
    }
    
    private static String generateToken(String username, String jwtSecret, long jwtExpiration) {
        Date now = new Date();
        Date expiryDate = new Date(now.getTime() + jwtExpiration);
        
        SecretKey key = Keys.hmacShaKeyFor(jwtSecret.getBytes());
        
        return Jwts.builder()
                .subject(username)
                .issuedAt(now)
                .expiration(expiryDate)
                .signWith(key)
                .compact();
    }
}