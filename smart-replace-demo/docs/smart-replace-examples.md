---
title: Smart Replace Advanced Examples
description: Real-world examples and patterns for using Smart Replace transforms
sidebar_position: 2
---

# Smart Replace Advanced Examples

This guide provides real-world examples of using Smart Replace transforms in various scenarios.

## Example 1: JWT Token Rotation in Microservices

**Scenario**: Your microservices use JWT tokens that expire every hour. During replay, old tokens cause 401 errors.

**Solution**: Use `smart_replace` to automatically handle token rotation.

### Transform Chain
```json
{
  "extractors": [{
    "type": "http_req_header",
    "config": {
      "header": "Authorization"
    }
  }],
  "transforms": [{
    "type": "regex",
    "config": {
      "expression": "Bearer (.+)",
      "replace": "$1"
    }
  }, {
    "type": "smart_replace",
    "config": {
      "overwrite": "false"
    }
  }]
}
```

### How It Works
1. Extract the Authorization header
2. Remove "Bearer " prefix with regex
3. Smart replace learns old token → new token mapping
4. All subsequent requests use the new token automatically

## Example 2: Bulk User Migration Testing

**Scenario**: Testing an API with 5000 production user IDs that don't exist in your test environment.

**Solution**: Use `smart_replace_csv` with a pre-generated mapping file.

### Step 1: Extract User IDs
```bash
speedctl extract data <snapshot-id> \
  --path "http.req.bodyJSON.userId" \
  --output user-ids.csv
```

### Step 2: Generate Test Mappings
```python
# generate_test_users.py
import csv
import uuid

with open('user-ids.csv', 'r') as f_in:
    with open('user-mappings.csv', 'w') as f_out:
        writer = csv.writer(f_out)
        writer.writerow(['Production ID', 'Test ID'])
        
        reader = csv.DictReader(f_in)
        for row in reader:
            prod_id = row['userId']
            test_id = f"test-user-{uuid.uuid4().hex[:8]}"
            writer.writerow([prod_id, test_id])
```

### Step 3: Apply Transform
```json
{
  "extractors": [{
    "type": "file",
    "config": {
      "path": "s3://user-mappings.csv"
    }
  }],
  "transforms": [{
    "type": "smart_replace_csv",
    "config": {
      "headers": "true",
      "existing": "Production ID",
      "new": "Test ID"
    }
  }]
}
```

## Example 3: OAuth 2.0 Flow with Refresh Tokens

**Scenario**: Your API uses OAuth 2.0 with access and refresh tokens. Both tokens change during replay.

**Solution**: Use `smart_replace_recorded` to maintain token relationships.

### Auth Response Transform
```json
{
  "filters": {
    "location": "/oauth/token"
  },
  "extractors": [{
    "type": "res_body"
  }],
  "transforms": [{
    "type": "json_path",
    "config": {
      "path": "$.access_token"
    }
  }, {
    "type": "smart_replace_recorded",
    "config": {
      "overwrite": "true"
    }
  }]
}
```

### Refresh Token Transform
```json
{
  "extractors": [{
    "type": "res_body"
  }],
  "transforms": [{
    "type": "json_path",
    "config": {
      "path": "$.refresh_token"
    }
  }, {
    "type": "smart_replace_recorded",
    "config": {
      "overwrite": "true"
    }
  }]
}
```

## Example 4: Database ID Consistency

**Scenario**: Creating records that return IDs, then using those IDs in subsequent requests.

**Solution**: Combine multiple smart replace strategies.

### Create Order Response
```json
{
  "filters": {
    "location": "/api/orders",
    "command": "POST"
  },
  "extractors": [{
    "type": "res_body"
  }],
  "transforms": [{
    "type": "json_path",
    "config": {
      "path": "$.orderId"
    }
  }, {
    "type": "smart_replace_recorded"
  }]
}
```

### Customer ID Mapping
```json
{
  "extractors": [{
    "type": "file",
    "config": {
      "path": "s3://customer-mappings.csv"
    }
  }],
  "transforms": [{
    "type": "smart_replace_csv",
    "config": {
      "headers": "true"
    }
  }]
}
```

## Example 5: GraphQL with Dynamic IDs

**Scenario**: GraphQL mutations return IDs used in subsequent queries.

**Solution**: Extract from GraphQL responses and apply smart replace.

```json
{
  "filters": {
    "tech": "graphql",
    "command": "mutation"
  },
  "extractors": [{
    "type": "res_body"
  }],
  "transforms": [{
    "type": "json_path",
    "config": {
      "path": "$.data.createUser.id"
    }
  }, {
    "type": "store_var",
    "config": {
      "key": "userId"
    }
  }, {
    "type": "smart_replace_recorded"
  }]
}
```

## Example 6: Multi-Environment Configuration

**Scenario**: Different API keys and endpoints for dev, staging, and production.

**Solution**: Use environment-specific CSV files.

### Environment Mappings (env-staging.csv)
```csv
Production Value,Staging Value
https://api.prod.com,https://api.staging.com
pk_live_abc123,pk_test_xyz789
admin@prod.com,admin@staging.com
```

### Transform Configuration
```json
{
  "extractors": [{
    "type": "file",
    "config": {
      "path": "s3://env-staging.csv"
    }
  }],
  "transforms": [{
    "type": "smart_replace_csv",
    "config": {
      "headers": "true",
      "existing": "Production Value",
      "new": "Staging Value"
    }
  }]
}
```

## Example 7: Handling Encoded Values

**Scenario**: User IDs are embedded in Base64-encoded JWT tokens.

**Solution**: Smart Replace automatically handles encoded values.

```json
{
  "extractors": [{
    "type": "http_req_header",
    "config": {
      "header": "Authorization"
    }
  }],
  "transforms": [{
    "type": "jwt_path",
    "config": {
      "claim": "sub"
    }
  }, {
    "type": "smart_replace",
    "config": {
      "overwrite": "false"
    }
  }]
}
```

## Example 8: Session-Based Testing

**Scenario**: E-commerce flow where session ID links cart operations.

### Login Response - Capture Session
```json
{
  "filters": {
    "location": "/api/login"
  },
  "extractors": [{
    "type": "http_res_cookie",
    "config": {
      "cookie": "sessionId"
    }
  }],
  "transforms": [{
    "type": "smart_replace_recorded"
  }]
}
```

### Cart Operations - Use Session
```json
{
  "extractors": [{
    "type": "http_req_cookie",
    "config": {
      "cookie": "sessionId"
    }
  }],
  "transforms": [{
    "type": "smart_replace"
  }]
}
```

## Best Practices from Examples

1. **Layer Transforms**: Combine extractors → processors → smart replace
2. **Use Filters**: Apply transforms only where needed to improve performance
3. **Test Incrementally**: Start with one endpoint, then expand
4. **Document Mappings**: Keep track of what's being replaced
5. **Version Control**: Store CSV files and transform configs in git

## Troubleshooting Tips

- **Values Not Replaced**: Check if values are encoded differently
- **Partial Replacement**: Ensure regex patterns capture full values
- **Performance Issues**: Use filters to limit transform scope
- **Debugging**: Enable transform logs to see what's being processed

## Next Steps

- Try these examples with your own API traffic
- Combine multiple smart replace types for complex scenarios
- Share your patterns with the Speedscale community