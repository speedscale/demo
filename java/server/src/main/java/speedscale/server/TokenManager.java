package speedscale.server;

import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.IOException;
import java.security.GeneralSecurityException;
import java.security.Key;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.NoSuchAlgorithmException;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.Date;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.bouncycastle.openssl.PEMParser;
import org.bouncycastle.openssl.jcajce.JcaPEMWriter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwsHeader;
import io.jsonwebtoken.JwtBuilder;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SigningKeyResolverAdapter;
import io.jsonwebtoken.security.Keys;

@Component
public class TokenManager {
    
    static final Logger log = LogManager.getLogger();

    @Value("${my.hmacSecret}")
    private String hmacSecret;

    @Value("${my.rsaPrivateKeyFile}")
    private String rsaPrivateKeyFile;

    @Value("${my.rsaPublicKeyFile}")
    private String rsaPublicKeyFile;

    private Key rsaPrivateKey;
    private Key rsaPublicKey;

    private MySigningKeyResolver resolver = new MySigningKeyResolver();

    public static int EXPIRATION_OFFSET = 60 * 60 * 24 * 1000;

    public String generateHmacToken(String username) {
        Key hmacShaKey = Keys.hmacShaKeyFor(hmacSecret.getBytes());
        return makeBuilder(username)
            .signWith(hmacShaKey).compact();
    }

    public String generateRsaToken(String username) {
        // Initialize the RSA key if it doesn't already exist
        Key rsaKey = getRsaKey();
        return makeBuilder(username)
            .signWith(rsaKey).compact();
    }

    public Boolean validateJwtToken(String jwsString) {
        try {
            Jwts.parserBuilder()
                .setSigningKeyResolver(resolver)
                .build()
                .parseClaimsJws(jwsString);
            
                return true;
        } catch (JwtException e) {
            e.printStackTrace();
        }
        return false;
    }

    // This lets us handle both HMAC and RSA for validation
    private class MySigningKeyResolver extends SigningKeyResolverAdapter {
        @Override
        public Key resolveSigningKey(JwsHeader jwsHeader, Claims claims) { 
            // Use this key for HMAC
            if (jwsHeader.getAlgorithm().equals("HS256")) {
                return Keys.hmacShaKeyFor(hmacSecret.getBytes()); 
            }

            // Use this key for RSA
            if (jwsHeader.getAlgorithm().equals("RS256")) {
                return getRsaKey();
            }

            return null;
        }
    }

    private JwtBuilder makeBuilder(String username) {
        long ts = System.currentTimeMillis();
        return Jwts.builder()
            .setIssuer("java-server")
            .setSubject(username)
            .setAudience("spacex-fans")
            .setIssuedAt(new Date(ts))
            .setExpiration(new Date(ts + EXPIRATION_OFFSET))
            .setNotBefore(new Date(ts - 60 * 60 * 1000));
    }

    private Key getRsaKey() {
        if (rsaPrivateKey == null) {
            // First check if the files exist
            File filePrivateKey = new File(rsaPrivateKeyFile);
            if (filePrivateKey.exists()) {
                readKeys();
            } else {
                generateAndWriteKeyPair();
            }
        }
        return rsaPrivateKey;
    }

    private void readKeys() {
        
        try {
            java.security.Security.addProvider(new org.bouncycastle.jce.provider.BouncyCastleProvider());
            KeyFactory factory = KeyFactory.getInstance("RSA");

            log.info("Reading RSA private key from " + rsaPrivateKeyFile);
            FileReader fr = new FileReader(rsaPrivateKeyFile);
            PEMParser pemParser = new PEMParser(fr);
            PKCS8EncodedKeySpec privKeySpec = new PKCS8EncodedKeySpec(pemParser.readPemObject().getContent());
            rsaPrivateKey = factory.generatePrivate(privKeySpec);
            fr.close();

            log.info("Reading RSA public key from " + rsaPublicKeyFile);
            fr = new FileReader(rsaPublicKeyFile);
            pemParser = new PEMParser(fr);
            X509EncodedKeySpec pubKeySpec = new X509EncodedKeySpec(pemParser.readPemObject().getContent());
            rsaPublicKey = factory.generatePublic(pubKeySpec);
            fr.close();

        } catch (IOException e) {
            e.printStackTrace();
        } catch (GeneralSecurityException e) {
            e.printStackTrace();
        }
    }

    private void generateAndWriteKeyPair() {
        try {
            log.info("Generating RSA key pair for the first time");
            KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
            generator.initialize(2048);
            KeyPair rsaKeyPair = generator.generateKeyPair();
            rsaPublicKey = rsaKeyPair.getPublic();
            rsaPrivateKey = rsaKeyPair.getPrivate();
            
            // Write out the public key
            FileWriter fw = new FileWriter(rsaPublicKeyFile);
            JcaPEMWriter writer = new JcaPEMWriter(fw);
            writer.writeObject(rsaPublicKey);
            writer.close();
            fw.close();

            // Write out the private key
            fw = new FileWriter(rsaPrivateKeyFile);
            writer = new JcaPEMWriter(fw);
            writer.writeObject(rsaPrivateKey);
            writer.close();
            fw.close();
        } catch (NoSuchAlgorithmException e) {
            e.printStackTrace();
        } catch (IOException e) {
            e.printStackTrace();
        }
    }
}
