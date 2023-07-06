package speedscale.server;

import java.util.HashMap;
import java.util.Map;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import speedscale.model.Login;

@RestController
public class Controller {

    @Value("${my.username}")
    private String username;
    @Value("${my.password}")
    private String password;

    @Autowired
    TokenManager jwt;

    static final Logger log = LogManager.getLogger();

    @GetMapping("/healthz")
    public String health() {
        return "{\"health\": \"ok\"}";
    }

    @PostMapping("/login")
    public Map<String, String> login(@RequestBody Login login) {
        Map<String, String> m = new HashMap<String, String>();
        if (!username.equals(login.getUsername()) || !password.equals(login.getPassword())) {
            m.put("err", "invalid auth");
            return m;
        }

        m.put("token", jwt.generateJwtToken(login.getUsername()));
        return m;
    }

    @GetMapping("/spacex/launches")
    public String launches() {
        try {
            return SpaceX.launches();
        } catch (Exception e) {
            log.catching(e);
        }
        return "{}";
    }

    @GetMapping("/spacex/ship/{id}")
    public String ship(@PathVariable String id) {
        try {
            return SpaceX.ship(id);
        } catch (Exception e) {
            log.catching(e);
        }
        return "{}";
    }

}
