---
title: Smart Replace Transforms Overview
description: Learn how Speedscale's Smart Replace transforms automatically handle dynamic data in API traffic replay
sidebar_position: 1
---

# Smart Replace Transforms Overview

## What is Smart Replace?

Smart Replace is Speedscale's AI-powered data transformation system that automatically finds and replaces values throughout recorded API traffic. Instead of manually identifying every instance of a changing value (like user IDs, session tokens, or request IDs), Smart Replace learns the mappings and applies them intelligently across all traffic patterns.

## The Problem Smart Replace Solves

When replaying recorded API traffic, many values become stale or invalid:

- **Session tokens** expire between recording and replay
- **User IDs** may not exist in test environments  
- **Request IDs** need to be unique for each replay
- **OAuth tokens** change with each authentication flow
- **Database IDs** differ between production and test environments

Without Smart Replace, you would need to:
1. Manually find every instance of these values
2. Write complex regex patterns or scripts
3. Update your scripts every time the API changes
4. Handle encoded values (JWT, Base64, etc.) separately

Smart Replace automates this entire process.

## Three Types of Smart Replace

### 1. `smart_replace` - Dynamic Value Replacement

**Purpose**: Automatically learn and replace values that change during your test flow.

**How it works**:
1. During the Mutate phase, it records the old value
2. During the Insert phase, it maps the old value to a new value
3. All future occurrences are automatically replaced

**Best for**:
- JWT tokens that change between authentication calls
- Session IDs generated during login
- Request IDs that must be unique
- Any value generated dynamically during the test

**Example**:
```json
{
  "type": "smart_replace",
  "config": {
    "overwrite": "false"
  }
}
```

### 2. `smart_replace_csv` - Bulk Replacement from CSV

**Purpose**: Replace multiple known values using a CSV lookup table.

**How it works**:
1. Load a CSV file with old→new value mappings
2. Automatically replace all occurrences throughout traffic
3. Works even with encoded values (JWT claims, etc.)

**Best for**:
- Migrating user IDs from production to test
- Replacing email addresses in bulk
- Updating API keys or client IDs
- Any scenario with pre-known mappings

**Example CSV**:
```csv
Existing Value,New Value
prod-user-123,test-user-001
john@prod.com,john@test.com
api-key-xyz,test-api-key
```

**Configuration**:
```json
{
  "type": "smart_replace_csv",
  "config": {
    "headers": "true",
    "existing": "Existing Value",
    "new": "New Value"
  }
}
```

### 3. `smart_replace_recorded` - Runtime Value Synchronization

**Purpose**: Replace recorded values with actual runtime values to maintain consistency.

**How it works**:
1. Uses the original recorded value as the key
2. Replaces with the actual value received during replay
3. Maintains request/response relationships

**Best for**:
- OAuth flows where tokens must match across calls
- Order IDs that link create/read operations
- Transaction IDs that span multiple requests
- Any server-generated ID that must remain consistent

**Example**:
```json
{
  "type": "smart_replace_recorded",
  "config": {
    "overwrite": "false"
  }
}
```

## When to Use Each Transform

| Scenario | Recommended Transform | Why |
|----------|---------------------|-----|
| JWT token expires between recording/replay | `smart_replace` | Token is generated during test flow |
| Replace 1000 production user IDs | `smart_replace_csv` | Bulk operation with known mappings |
| OAuth access_token changes each run | `smart_replace_recorded` | Must sync recorded vs runtime values |
| Unique request IDs for each test | `smart_replace` | IDs generated dynamically |
| Migrate emails from prod to test | `smart_replace_csv` | Pre-known email mappings |
| Order ID links POST and GET calls | `smart_replace_recorded` | Maintain create/read relationship |

## Key Benefits

1. **Automatic Detection**: Finds values even when encoded (JWT, Base64, URL encoding)
2. **No Scripting Required**: Replace complex regex patterns with simple configuration
3. **Maintains Relationships**: Preserves links between requests and responses
4. **Scales Effortlessly**: Handle 10 or 10,000 replacements with same effort
5. **AI-Powered**: Learns patterns and applies replacements intelligently

## Common Use Cases

### Authentication Flows
```yaml
Transform Chain: jwt_path -> smart_replace
Purpose: Replace expired JWT tokens automatically
```

### Data Migration Testing
```yaml
Transform Chain: read_file("users.csv") -> smart_replace_csv
Purpose: Replace production user IDs with test IDs
```

### OAuth Integration
```yaml
Transform Chain: json_path("$.access_token") -> smart_replace_recorded
Purpose: Sync OAuth tokens between auth and API calls
```

## Best Practices

1. **Use `overwrite: false`** for most scenarios to maintain consistent mappings
2. **Combine with extractors** (json_path, jwt_path) to target specific fields
3. **Test with small datasets** before applying to large traffic volumes
4. **Use CSV headers** for better maintainability
5. **Apply at the snapshot level** for consistent behavior across all replays

## Performance Considerations

- Smart Replace transforms add minimal overhead
- CSV operations are loaded once and cached
- Pattern matching is optimized for large datasets
- Works efficiently even with thousands of replacements

## Next Steps

- [Smart Replace Tutorial](./smart-replace-tutorial.md) - Step-by-step guide
- [Advanced Examples](./smart-replace-examples.md) - Complex scenarios
- [Troubleshooting Guide](./smart-replace-troubleshooting.md) - Common issues

Remember: Smart Replace transforms are designed to make your life easier. If you find yourself writing complex scripts or regex patterns, there's probably a Smart Replace solution that's simpler and more maintainable.