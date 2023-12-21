package speedscale.server;

import java.util.Calendar;
import java.util.HashMap;
import java.util.Map;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.bind.annotation.RestController;

import speedscale.lib.*;
import speedscale.model.Login;
import speedscale.model.TreasuryResponse;

@RestController
public class Controller {

    @Autowired
    TokenManager jwt;

    static final Logger log = LogManager.getLogger();

    @GetMapping("/healthz")
    public Map<String, String> health() {
        Map<String, String> m = new HashMap<String, String>();
        m.put("health", "ok");
        return m;
    }

    @PostMapping("/login")
    public Map<String, String> login(@RequestBody Login login) {
        Map<String, String> m = new HashMap<String, String>();
        
        // Check the user auth
        boolean valid = UserAuth.validate(login);
        if (!valid) {
            m.put("err", "invalid auth");
            return m;
        }

        m.put("access_token", jwt.generateHmacToken(login.getUsername()));
        m.put("token_type", "Bearer");
        m.put("expires_id", TokenManager.EXPIRATION_OFFSET + "");
        return m;
    }

    @PostMapping("/rsaToken")
    public Map<String, String> rsaToken(@RequestBody Login login) {
        Map<String, String> m = new HashMap<String, String>();
        
        // Check the user auth
        boolean valid = UserAuth.validate(login);
        if (!valid) {
            m.put("err", "invalid auth");
            return m;
        }

        m.put("access_token", jwt.generateRsaToken(login.getUsername()));
        m.put("token_type", "Bearer");
        m.put("expires_id", TokenManager.EXPIRATION_OFFSET + "");
        return m;
    }


    @GetMapping("/spacex/launches")
    public ResponseEntity<String> launches() {
        try {
            return ResponseEntity.ok()
                    .header("Content-Type", "application/json")
                    .body(SpaceX.launches());
        } catch (Exception e) {
            log.catching(e);
        }
        return ResponseEntity.ok()
                .header("Content-Type", "application/json")
                .body("{}");
    }

    @GetMapping("/spacex/ship")
    public Map<String, String> randomShip() {
        Map<String, String> m = new HashMap<String, String>();
        m.put("ship_id", SpaceX.randomShip());
        return m;
    }

    @GetMapping("/spacex/ship/{id}")
    public ResponseEntity<String> ship(@PathVariable String id) {
        try {
            return ResponseEntity.ok()
                    .header("Content-Type", "application/json")
                    .body(SpaceX.ship(id));
        } catch (Exception e) {
            log.catching(e);
        }
        return ResponseEntity.ok()
                .header("Content-Type", "application/json")
                .body("{}");
    }

    @GetMapping("/treasury/max_interest")
    @ResponseBody
    public TreasuryResponse.Record interest() {
        Calendar firstOfYear = Calendar.getInstance();
        firstOfYear.set(Calendar.DAY_OF_MONTH, 1);
        firstOfYear.set(Calendar.MONTH, 1);

        try {
            TreasuryResponse resp = Treasury.interestRates(firstOfYear.getTime());
            TreasuryResponse.Record max = resp.data.remove(0);
            for (TreasuryResponse.Record record : resp.data) {
                if (max.avg_interest_rate_amt < record.avg_interest_rate_amt) {
                    max = record;
                }
            }
            return max;
        } catch (Exception e) {
            log.catching(e);
        }
        return null;
    }

}
