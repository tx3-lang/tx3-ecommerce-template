# Order Cleanup Function

This Supabase Edge Function provides automated cleanup for expired stock reservations and abandoned orders.

## Features

- **Automated Stock Reservation Cleanup**: Releases stock from expired reservations (30+ minutes)
- **Auto-cancellation of Orders**: Cancels orders with expired reservations
- **Health Monitoring**: Provides metrics on reservation health
- **Secure Access**: API key protected for scheduled execution

## Endpoints

### POST /order-cleanup
**Description**: Triggers the cleanup process
**Authentication**: Bearer token in Authorization header
**Response**: JSON with cleanup results

### GET /order-cleanup (optional health check)
**Description**: Returns reservation health metrics
**Authentication**: None (for monitoring)
**Response**: JSON with health status

## Usage

### Manual Execution
```bash
curl -X POST "https://your-project.supabase.co/functions/v1/order-cleanup" \
  -H "Authorization: Bearer YOUR_CLEANUP_API_KEY" \
  -H "Content-Type: application/json"
```

### Health Check
```bash
curl "https://your-project.supabase.co/functions/v1/order-cleanup"
```

## Scheduled Execution

Set up a cron job to run every 5 minutes:

```bash
*/5 * * * * curl -X POST "https://your-project.supabase.co/functions/v1/order-cleanup" \
  -H "Authorization: Bearer YOUR_CLEANUP_API_KEY" \
  -H "Content-Type: application/json"
```

### Alternative: Using GitHub Actions
```yaml
name: Order Cleanup
on:
  schedule:
    - cron: '*/5 * * * *'  # Every 5 minutes

jobs:
  cleanup:
    runs-on: ubuntu-latest
    steps:
      - name: Run Order Cleanup
        run: |
          curl -X POST "${{ secrets.SUPABASE_URL }}/functions/v1/order-cleanup" \
            -H "Authorization: Bearer ${{ secrets.CLEANUP_API_KEY }}" \
            -H "Content-Type: application/json"
```

## Environment Variables

- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key for database access
- `CLEANUP_API_KEY`: API key for function authentication

## Response Format

### Success Response
```json
{
  "success": true,
  "message": "Cleanup completed successfully",
  "expiredReservations": 5,
  "cancelledOrders": 2,
  "timestamp": "2023-12-01T12:00:00.000Z"
}
```

### Error Response
```json
{
  "success": false,
  "message": "Failed to cleanup expired reservations",
  "timestamp": "2023-12-01T12:00:00.000Z"
}
```

## Database Functions Used

The Edge Function calls these PostgreSQL functions:

- `cleanup_expired_reservations()`: Releases expired stock reservations
- `auto_cancel_expired_orders()`: Cancels orders with expired reservations

## Monitoring

Monitor the function through:
1. Supabase Dashboard logs
2. Health endpoint metrics
3. Custom monitoring solution calling the health endpoint

## Security Considerations

- Uses service role key (restricted to database functions)
- API key authentication prevents unauthorized execution
- CORS headers configured for browser access
- Error logging for troubleshooting

## Performance

- Typically completes in < 2 seconds
- Processes expired reservations efficiently
- Minimal database impact due to optimized functions
- Automatic rollback on errors