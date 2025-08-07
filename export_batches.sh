#!/bin/bash

# === CONFIG ===
TOTAL=67          # total documents in finalExams
BATCH_SIZE=10
COLLECTION=finalExams
DB="experiment"
URI="mongodb+srv://sql-admin:SMff5PqhhoVbX6z7@sqlmentor.ydqmecv.mongodb.net/$DB"

# === EXPORT LOOP ===
echo "🚀 Exporting $COLLECTION in batches of $BATCH_SIZE..."

for (( i=0; i<TOTAL; i+=BATCH_SIZE ))
do
  END=$((i + BATCH_SIZE - 1))
  echo "📤 Exporting documents $i to $END..."

  mongoexport \
    --uri="$URI" \
    --collection="$COLLECTION" \
    --skip=$i \
    --limit=$BATCH_SIZE \
    --jsonArray \
    --out="finalExams_batch_$i.json"

  # Optional: small pause between batches
  sleep 1
done

echo "✅ All batches exported."