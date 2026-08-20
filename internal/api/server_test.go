package api

import (
	"encoding/json"
	"testing"
	"time"
)

func TestReferencePrefix(t *testing.T) {
	r := ref("VTE")
	if len(r) < 4 || r[:3] != "VTE" {
		t.Fatalf("référence invalide: %s", r)
	}
}

func TestDashboardPeriods(t *testing.T) {
	now := time.Date(2026, time.August, 18, 12, 0, 0, 0, time.UTC)
	tests := []struct {
		period string
		points int
		bucket string
	}{{"7d", 7, "day"}, {"30d", 30, "day"}, {"90d", 90, "day"}, {"12m", 12, "month"}}
	for _, test := range tests {
		start, bucket := dashboardPeriod(test.period, now)
		if bucket != test.bucket {
			t.Fatalf("%s: bucket %s", test.period, bucket)
		}
		points := fillTrend(nil, start, now, bucket)
		if len(points) != test.points {
			t.Fatalf("%s: %d points, attendu %d", test.period, len(points), test.points)
		}
	}
}

func TestReturnInputDecodesQuantityAndAmount(t *testing.T) {
	body := []byte(`{
		"saleId": 42,
		"reason": "Article défectueux",
		"refundMethod": "cash",
		"restock": true,
		"items": [
			{"variantId": 7, "quantity": 2, "amount": 30000},
			{"variantId": 9, "quantity": 1, "amount": 12500}
		]
	}`)
	var in returnInput
	if e := json.Unmarshal(body, &in); e != nil {
		t.Fatalf("décodage impossible: %v", e)
	}
	if in.SaleID != 42 || !in.Restock {
		t.Fatalf("en-tête du retour mal décodé: %+v", in)
	}
	if len(in.Items) != 2 {
		t.Fatalf("%d lignes décodées, attendu 2", len(in.Items))
	}
	expected := []returnLineInput{{VariantID: 7, Quantity: 2, Amount: 30000}, {VariantID: 9, Quantity: 1, Amount: 12500}}
	var total int64
	for i, line := range in.Items {
		if line != expected[i] {
			t.Fatalf("ligne %d décodée %+v, attendu %+v", i, line, expected[i])
		}
		total += line.Amount
	}
	if total != 42500 {
		t.Fatalf("montant remboursé %d, attendu 42500", total)
	}
}
