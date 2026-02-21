#!/bin/bash

# Load API Key from .env.local
export $(grep -v '^#' .env.local | xargs)

if [ -z "$GEMINI_API_KEY" ]; then
  echo "GEMINI_API_KEY not found in .env.local"
  exit 1
fi

echo "Listing models using API Key: ${GEMINI_API_KEY:0:5}..."

curl -s "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY" > models.json

# Check if curl was successful
if [ $? -eq 0 ]; then
  echo "Models fetched successfully. Output saved to models.json"
  cat models.json | grep "\"name\":" | head -n 20
else
  echo "Curl failed."
fi
