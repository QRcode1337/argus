#!/bin/bash
# Argus Health Check Script
# Checks www.argusweb.bond daily for issues

URL="https://www.argusweb.bond"
LOGFILE="/home/volta/argus/logs/health-check.log"
ALERT_WEBHOOK="${HEALTH_CHECK_WEBHOOK:-}"  # Optional: set this env var for alerts

# Create logs directory if needed
mkdir -p "$(dirname "$LOGFILE")"

# Timestamp
DATE=$(date '+%Y-%m-%d %H:%M:%S')

# Check HTTP status and response time
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 "$URL")
RESPONSE_TIME=$(curl -s -o /dev/null -w "%{time_total}" --max-time 30 "$URL")
SSL_EXPIRY=$(echo | openssl s_client -servername www.argusweb.bond -connect www.argusweb.bond:443 2>/dev/null | openssl x509 -noout -dates | grep notAfter | cut -d= -f2)

# Log results
echo "[$DATE] Status: $HTTP_STATUS | Response: ${RESPONSE_TIME}s | SSL Expires: $SSL_EXPIRY" >> "$LOGFILE"

# Check for issues
ISSUES=""

if [ "$HTTP_STATUS" != "200" ]; then
    ISSUES="HTTP Status: $HTTP_STATUS (expected 200)\n$ISSUES"
fi

if (( $(echo "$RESPONSE_TIME > 5.0" | bc -l) )); then
    ISSUES="Slow response: ${RESPONSE_TIME}s\n$ISSUES"
fi

# Check SSL expiry (within 7 days)
if [ -n "$SSL_EXPIRY" ]; then
    EXPIRY_EPOCH=$(date -d "$SSL_EXPIRY" +%s)
    NOW_EPOCH=$(date +%s)
    DAYS_UNTIL_EXPIRY=$(( (EXPIRY_EPOCH - NOW_EPOCH) / 86400 ))
    
    if [ $DAYS_UNTIL_EXPIRY -lt 7 ]; then
        ISSUES="SSL expires in $DAYS_UNTIL_EXPIRY days\n$ISSUES"
    fi
fi

# Check Portainer container health
PORTAINER_STATUS=$(docker ps --filter "name=portainer" --format "{{.Status}}" 2>/dev/null)
if [ -z "$PORTAINER_STATUS" ]; then
    ISSUES="Portainer container is not running\n$ISSUES"
fi

# Check key feed endpoints
for FEED in aisstream adsb-military cloudflare-radar gdelt usgs news otx fred; do
    TIMEOUT=30
    [ "$FEED" = "aisstream" ] && TIMEOUT=60
    FEED_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time $TIMEOUT "$URL/api/feeds/$FEED")
    if [ "$FEED_STATUS" != "200" ]; then
        ISSUES="Feed $FEED: HTTP $FEED_STATUS (expected 200)\n$ISSUES"
    fi
done

# Alert if issues found
if [ -n "$ISSUES" ]; then
    echo "[$DATE] ALERT: Issues detected:" >> "$LOGFILE"
    echo -e "$ISSUES" >> "$LOGFILE"
    
    # Ping via OpenClaw CLI to Telegram
    openclaw message send --target "telegram:1110744884" --message "🚨 Argus Health Check Alert:
$ISSUES" >/dev/null 2>&1
    
    exit 1
fi

echo "[$DATE] OK" >> "$LOGFILE"
exit 0
