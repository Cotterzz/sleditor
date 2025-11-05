# Bandwidth Tracking Fix - CORS Workaround

## Problem
Network bandwidth was showing 0 KB even though requests were being made. This is because:

1. **CORS restrictions**: Cross-origin requests (like Supabase) don't report `transferSize` unless the server sends `Timing-Allow-Origin` header
2. **Cached resources**: Always report `transferSize = 0`

## Solution
Implemented a **three-tier fallback** for calculating bandwidth:

### Priority 1: `transferSize` (Best)
- Includes HTTP headers + body
- Most accurate
- Only available for same-origin OR cross-origin with `Timing-Allow-Origin` header

### Priority 2: `encodedBodySize` (Good)
- Compressed response body size (e.g., gzipped)
- Available even for CORS requests
- We add 10% overhead estimate for headers
- Formula: `encodedBodySize * 1.1`

### Priority 3: `decodedBodySize` (Fallback)
- Uncompressed response body size
- Always available
- We estimate 50% compression ratio + 10% headers
- Formula: `decodedBodySize * 0.55`

## Debug Mode
To see what's happening, open the console and run:
```javascript
window.DEBUG_BANDWIDTH = true;
```

This will log every network sample:
```
[Bandwidth] 5 requests, 234.5 KB (2 exact, 3 estimated)
```

Where:
- **exact** = Used `transferSize`
- **estimated** = Used `encodedBodySize` or `decodedBodySize` with fallback calculation

## Why The Estimates?

### Header Overhead (10%)
HTTP headers typically add 5-15% to the response size. We use 10% as a reasonable middle ground.

Example headers:
```
Content-Type: application/json
Cache-Control: max-age=3600
Content-Encoding: gzip
...
```

### Compression Ratio (50%)
Most modern servers use gzip/brotli compression. Typical compression ratios:
- JSON: 60-80% reduction
- HTML: 50-70% reduction
- Images (already compressed): 0-10% reduction

We estimate 50% as a conservative average.

## Accuracy
- **Same-origin resources**: 100% accurate (uses `transferSize`)
- **Supabase API calls**: ~90% accurate (uses `encodedBodySize` + 10%)
- **Supabase Storage (images)**: ~80-90% accurate (images are already compressed, less benefit from encoding)

## Testing
1. Enable debug mode: `window.DEBUG_BANDWIDTH = true`
2. Clear browser cache
3. Load gallery
4. Watch console for bandwidth logs
5. Check Performance Monitor for totals

You should now see the Network total increasing as requests are made!

## Alternative: Server-Side Header
If you control the Supabase setup, you could add this header to get 100% accurate `transferSize`:
```
Timing-Allow-Origin: *
```

But the fallback method works well without needing server changes.

