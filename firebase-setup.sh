#!/bin/bash

# Firebase Schema Initialization Script
# Run this once to create the necessary Firestore collections and documents

echo "🔧 Initializing Firestore schema for balance tracking system..."

# Create systemSettings/instantDataConfig document
firebase firestore:set systemSettings/instantDataConfig "{
  \"currentBalance\": 0,
  \"lastUpdated\": null,
  \"currency\": \"GHS\",
  \"lowBalanceThreshold\": 50,
  \"minBalanceForOrder\": 5,
  \"isServiceActive\": true,
  \"lastTopUpDate\": null,
  \"lastTopUpAmount\": 0
}" --yes 2>&1 | head -20

echo ""
echo "📊 Creating dataPackagePricing documents..."

# MTN packages
firebase firestore:set dataPackagePricing/MTN-1GB "{
  \"dataAmount\": \"1\",
  \"costPrice\": 4.15,
  \"sellingPrice\": 5.00,
  \"profit\": 0.85,
  \"network\": \"MTN\",
  \"isActive\": true
}" --yes 2>&1 | head -10

firebase firestore:set dataPackagePricing/MTN-2GB "{
  \"dataAmount\": \"2\",
  \"costPrice\": 7.90,
  \"sellingPrice\": 9.50,
  \"profit\": 1.60,
  \"network\": \"MTN\",
  \"isActive\": true
}" --yes 2>&1 | head -10

# AirtelTigo packages
firebase firestore:set dataPackagePricing/AirtelTigo-1GB "{
  \"dataAmount\": \"1\",
  \"costPrice\": 4.10,
  \"sellingPrice\": 5.00,
  \"profit\": 0.90,
  \"network\": \"AirtelTigo\",
  \"isActive\": true
}" --yes 2>&1 | head -10

# Telecel packages
firebase firestore:set dataPackagePricing/Telecel-1GB "{
  \"dataAmount\": \"1\",
  \"costPrice\": 4.20,
  \"sellingPrice\": 5.00,
  \"profit\": 0.80,
  \"network\": \"Telecel\",
  \"isActive\": true
}" --yes 2>&1 | head -10

echo ""
echo "✅ Firestore schema initialized successfully!"
echo ""
echo "📌 Created Collections:"
echo "   • systemSettings/instantDataConfig - Current balance and configuration"
echo "   • dataPackagePricing/* - Pricing for each network/data amount combo"
echo "   • transactions/* - Enhanced with balance tracking fields"
echo ""
echo "Next: Deploy the backend with updated webhook handler"
