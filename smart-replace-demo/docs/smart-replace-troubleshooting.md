---
title: Smart Replace Troubleshooting Guide
description: Common issues and solutions when using Smart Replace transforms
sidebar_position: 3
---

# Smart Replace Troubleshooting Guide

This guide helps you diagnose and fix common issues with Smart Replace transforms.

## Common Issues

### Values Not Being Replaced

**Symptoms**: 
- Original values appear in replay
- 401/403 authentication errors
- "Not found" errors for IDs

**Diagnosis Steps**:
1. Check if values are encoded differently
2. Verify transform chain order
3. Ensure filters aren't too restrictive

**Solutions**:

#### Check Encoding
```json
// Wrong - only handles plain text
{
  "type": "smart_replace"
}

// Right - handles JWT-encoded values
{
  "extractors": [{
    "type": "jwt_path",
    "config": {"claim": "userId"}
  }],
  "transforms": [{
    "type": "smart_replace"
  }]
}
```

#### Verify Transform Order
```json
// Wrong - smart_replace before extraction
{
  "transforms": [
    {"type": "smart_replace"},
    {"type": "json_path", "config": {"path": "$.id"}}
  ]
}

// Right - extract first, then replace
{
  "transforms": [
    {"type": "json_path", "config": {"path": "$.id"}},
    {"type": "smart_replace"}
  ]
}
```

### CSV File Not Loading

**Symptoms**:
- "File not found" errors
- No replacements happening
- Transform appears to skip

**Solutions**:

1. **Check file upload**:
```bash
speedctl push userdata my-mappings.csv
# Note the returned ID
```

2. **Verify S3 path**:
```json
// Wrong
"path": "my-mappings.csv"

// Right
"path": "s3://my-mappings.csv"
```

3. **Validate CSV format**:
```csv
# Must have headers if headers=true
Existing,New
value1,replacement1

# No headers if headers=false
value1,replacement1
```

### Partial Replacements

**Symptoms**:
- Some occurrences replaced, others not
- Inconsistent behavior across requests

**Common Causes**:

1. **Different encodings**:
   - URL encoded: `john%40example.com`
   - Plain text: `john@example.com`
   - Base64: `am9obkBleGFtcGxlLmNvbQ==`

2. **Case sensitivity**:
   - Original: `UserID123`
   - In traffic: `userid123`

**Solution**: Use multiple transforms
```json
[
  {
    "type": "url_decode"
  },
  {
    "type": "smart_replace",
    "config": {"overwrite": "true"}
  }
]
```

### Performance Issues

**Symptoms**:
- Slow replay start
- High memory usage
- Timeouts

**Solutions**:

1. **Use filters to limit scope**:
```json
{
  "filters": {
    "location": "/api/users/*"
  },
  "transforms": [{
    "type": "smart_replace"
  }]
}
```

2. **Split large CSVs**:
```bash
# Split into chunks
split -l 1000 large-mappings.csv chunk-

# Apply separately
speedctl push userdata chunk-aa
speedctl push userdata chunk-ab
```

3. **Optimize transform chains**:
```json
// Inefficient - processes everything
{
  "transforms": [
    {"type": "smart_replace_csv"},
    {"type": "smart_replace"},
    {"type": "smart_replace_recorded"}
  ]
}

// Efficient - targeted transforms
{
  "filters": {"tech": "jwt"},
  "transforms": [{"type": "smart_replace"}]
}
```

### Overwrite Conflicts

**Symptoms**:
- Values change unexpectedly
- Mappings don't persist
- Inconsistent replacements

**Understanding overwrite**:
- `overwrite: false` - First mapping wins (default)
- `overwrite: true` - Last mapping wins

**Example scenario**:
```
Request 1: token_abc → token_xyz (stored)
Request 2: token_abc → token_123 
- If overwrite=false: still uses token_xyz
- If overwrite=true: now uses token_123
```

### OAuth Token Issues

**Symptoms**:
- Refresh token not working
- Access token mismatch
- Authentication loops

**Solution**: Separate transforms for each token
```json
// Access token transform
{
  "filters": {
    "location": "/oauth/token"
  },
  "extractors": [{
    "type": "json_path",
    "config": {"path": "$.access_token"}
  }],
  "transforms": [{
    "type": "smart_replace_recorded",
    "config": {"overwrite": "true"}
  }]
}

// Refresh token transform (separate)
{
  "extractors": [{
    "type": "json_path",
    "config": {"path": "$.refresh_token"}
  }],
  "transforms": [{
    "type": "smart_replace_recorded",
    "config": {"overwrite": "true"}
  }]
}
```

## Debugging Techniques

### Enable Transform Logging
```bash
# Run replay with debug logging
speedctl replay start --debug-transforms
```

### Test with Small Dataset
1. Create minimal snapshot
2. Apply one transform at a time
3. Verify each step works

### Use Transform Preview
```bash
# Preview what will be replaced
speedctl transform preview <snapshot-id> --chain "smart_replace"
```

### Check Variable State
```json
{
  "transforms": [
    {"type": "smart_replace"},
    {"type": "store_var", "config": {"key": "debug_value"}}
  ]
}
```

## Best Practices to Avoid Issues

1. **Always test transforms incrementally**
2. **Use descriptive variable names**
3. **Document your CSV mappings**
4. **Keep transforms simple and targeted**
5. **Use filters to improve performance**
6. **Version control your transform configs**

## Getting Help

If you're still experiencing issues:

1. Check the [Smart Replace Examples](./smart-replace-examples.md)
2. Review your transform chain order
3. Contact support with:
   - Your transform configuration
   - Sample traffic (sanitized)
   - Error messages
   - Debug logs

Remember: Smart Replace is designed to be simple. If you're writing complex configurations, there might be an easier approach!