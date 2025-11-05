# Bandwidth Monitoring Feature

## Overview
Added cumulative session-wide network bandwidth tracking to the Performance Monitor.

## New Metrics

The Performance Monitor now displays **Session Totals** showing:

1. **Network**: Total data transferred (KB or MB)
2. **Requests**: Total number of HTTP requests
3. **Duration**: Session runtime (seconds or minutes)

## How It Works

### Data Collection
- Uses `performance.getEntriesByType('resource')` to track all HTTP requests
- Accumulates `transferSize` from each resource entry
- Counts every new request since the last sample

### Important Notes About `transferSize`

**What IS included:**
- ✅ HTTP response body size (actual file content)
- ✅ HTTP headers (both request and response)
- ✅ Overhead from HTTP protocol

**What is NOT included:**
- ❌ **Cached resources** - If a resource is served from browser cache (disk or memory), `transferSize` = 0
- ❌ Resources blocked by CORS or security policies
- ❌ WebSocket data (tracked separately)

### Does It Include Cached Data?

**No.** The browser's `performance.getEntriesByType('resource')` API returns:
- `transferSize: 0` for cached resources
- `transferSize > 0` only for network transfers

This means:
- First load: Counts all data
- Subsequent loads: Only counts non-cached resources
- Hard refresh (Ctrl+Shift+R): Bypasses cache, counts everything again

## Gallery Caching Impact

With the gallery caching system, you should see:
- **First gallery load**: Multiple requests, significant bandwidth
- **Cached gallery loads**: Zero network requests, zero bandwidth
- **Force refresh (⟳ button)**: Full reload, bandwidth counted

## Accessing the Monitor

1. **Mini visualization**: Always visible in the top-right corner (colored bar)
2. **Full panel**: Click the mini visualization to open detailed view
3. **Session totals**: Displayed at top of full panel

## Use Cases

### Measuring Gallery Cache Effectiveness
1. Open Performance Monitor
2. Note current totals
3. Click gallery tabs and observe requests
4. Cached tabs = no new requests
5. Force refresh = new requests counted

### Bandwidth Budget Testing
Monitor session totals to ensure you stay within Supabase free tier:
- **Free tier**: 5 GB/month = ~170 MB/day average
- Track daily usage by monitoring session totals

### Debugging Network Issues
- See real-time bandwidth spikes
- Identify unexpected requests
- Measure impact of changes

## Display Format

```
Session Totals:
Network: 2.45 MB    ← Total downloaded (auto-switches KB/MB)
Requests: 127       ← Total HTTP requests
Duration: 2m 34s    ← Session runtime
```

## Technical Details

### State Tracking
```javascript
perfState.totalNetworkBytes = 0;    // Cumulative bytes
perfState.totalNetworkRequests = 0; // Cumulative requests
perfState.sessionStartTime = performance.now(); // Session start
```

### Update Frequency
- Samples every 200ms
- Totals updated in real-time
- Zero performance impact (uses existing sampling)

## Limitations

1. **Browser cache transparency**: Cannot distinguish between disk cache and network fetch if cached
2. **CORS resources**: Some resources may not report size due to CORS
3. **WebSocket data**: Not included in `transferSize` (tracked separately as WS Msgs)
4. **Session-only**: Resets on page reload

## Related Files
- `js/performance-monitor.js` - Main implementation
- `js/save.js` - Gallery caching that reduces bandwidth
- `js/backend.js` - Thumbnail optimization (256x256 JPEG)

## Testing
To verify bandwidth tracking:
1. Open Performance Monitor panel
2. Clear browser cache (DevTools → Network → Disable cache)
3. Navigate to gallery tabs and note bandwidth increase
4. Click same tab again → should use cache (no bandwidth increase)
5. Click refresh button (⟳) → bandwidth should increase again

