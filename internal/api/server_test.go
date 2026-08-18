package api

import (
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
