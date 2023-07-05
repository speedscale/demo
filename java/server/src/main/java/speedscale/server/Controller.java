package speedscale.server;

import java.util.Date;
import java.util.HashMap;
import java.util.Map;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import speedscale.model.Login;

@RestController
public class Controller {

    @Value("${my.username}")
    private String username;
    @Value("${my.password}")
    private String password;

    @Value("${my.key}")
    private String JWTKey;

    static final Logger log = LogManager.getLogger();

    @GetMapping("/healthz")
    public String health() {
        return "{\"health\": \"ok\"}";
    }

    private String generateJwtToken(String username) {
        Map<String, Object> claims = new HashMap<>();
        return Jwts.builder().setClaims(claims).setSubject(username)
                .setIssuedAt(new Date(System.currentTimeMillis()))
                .setExpiration(new Date(System.currentTimeMillis() + 60 * 60 * 24 * 1000))
                .signWith(SignatureAlgorithm.HS256, JWTKey).compact();
    }

    @PostMapping("/login")
    public Map<String, String> login(@RequestBody Login login) {
        Map<String, String> m = new HashMap<String, String>();
        if (!username.equals(login.getUsername()) || !password.equals(login.getPassword())) {
            m.put("err", "invalid auth");
            return m;
        }

        m.put("token", generateJwtToken(login.getUsername()));
        return m;
    }

    @GetMapping("/launches")
    public String launches() {
        try {
            return SpaceX.invoke();
        } catch (Exception e) {
            log.catching(e);
        }
        return "{}";
    }

}
