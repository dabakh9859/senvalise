package api

import "testing"

func TestReferencePrefix(t *testing.T) {
	r := ref("VTE")
	if len(r) < 4 || r[:3] != "VTE" {
		t.Fatalf("référence invalide: %s", r)
	}
}
