package messaging

import "testing"

// Les numeros saisis au comptoir ne suivent aucune convention. Cette table
// fige les formes rencontrees dans les fiches clients, et surtout celles qui
// doivent etre refusees : un numero accepte a tort part dans le vide et compte
// comme un envoi reussi.
func TestNormalisePhone(t *testing.T) {
	cases := map[string]string{
		"77 123 45 67":     "221771234567",
		"+221 77 123 4567": "221771234567",
		"00221771234567":   "221771234567",
		"221771234567":     "221771234567",
		"0771234567":       "221771234567",
		"78-123-45-67":     "221781234567",
		"":                 "",
		"12345":            "",
		"33 800 00 00":     "", // fixe a huit chiffres : hors perimetre mobile
		"7712345":          "",
	}
	for input, expected := range cases {
		if got := NormalisePhone(input); got != expected {
			t.Errorf("NormalisePhone(%q) = %q, attendu %q", input, got, expected)
		}
	}
}

func TestChatIDAndInternational(t *testing.T) {
	if got := ChatID("77 123 45 67"); got != "221771234567@c.us" {
		t.Errorf("ChatID = %q", got)
	}
	if got := InternationalPhone("77 123 45 67"); got != "+221771234567" {
		t.Errorf("InternationalPhone = %q", got)
	}
	if ChatID("abc") != "" || InternationalPhone("abc") != "" {
		t.Error("un numero invalide doit rendre une chaine vide, pas une adresse fabriquee")
	}
}

// Un jeton inconnu doit disparaitre : recevoir « {{reste}} » dans un message
// commercial est pire que de recevoir une phrase incomplete.
func TestRender(t *testing.T) {
	values := map[string]string{"nom": "Fatou", "reste": "12 000 F"}
	got := Render("Bonjour {{nom}}, il reste {{ reste }}. {{inconnu}}", values)
	if got != "Bonjour Fatou, il reste 12 000 F. " {
		t.Errorf("Render = %q", got)
	}
}

func TestMoney(t *testing.T) {
	cases := map[int64]string{0: "0 F", 999: "999 F", 1000: "1 000 F", 145000: "145 000 F", 1234567: "1 234 567 F", -5000: "-5 000 F"}
	for amount, expected := range cases {
		if got := Money(amount); got != expected {
			t.Errorf("Money(%d) = %q, attendu %q", amount, got, expected)
		}
	}
}

// Le comptage des segments decide de la facture Orange : un accent divise la
// capacite par deux, ce que l'ecran doit annoncer avant une diffusion.
func TestSMSParts(t *testing.T) {
	parts, unicode := SMSParts("Bonjour, votre commande est prete.")
	if parts != 1 || unicode {
		t.Errorf("texte simple : parts=%d unicode=%v", parts, unicode)
	}
	parts, unicode = SMSParts("Votre commande est prête.")
	if parts != 1 || !unicode {
		t.Errorf("texte accentue : parts=%d unicode=%v", parts, unicode)
	}
	long := ""
	for len(long) < 200 {
		long += "abcdefghij"
	}
	if parts, _ := SMSParts(long); parts != 2 {
		t.Errorf("200 caracteres ASCII doivent tenir en 2 segments, obtenu %d", parts)
	}
}

// Une configuration absente ou corrompue ne doit jamais empecher l'ecran de
// s'ouvrir, ni laisser un debit a zero qui bloquerait toute la file.
func TestParseFallsBackToSafeDefaults(t *testing.T) {
	config := Parse("{ceci n'est pas du json")
	if config.Throttle.PerMinute < 1 || config.Throttle.MinDelaySeconds < 1 {
		t.Error("un debit nul bloquerait la file sans le dire")
	}
	if config.WhatsApp.Session == "" || config.Reminders.Body == "" {
		t.Error("les valeurs de travail doivent etre retablies")
	}

	config = Parse(`{"throttle":{"perMinute":0,"minDelaySeconds":0},"reminders":{"channel":"pigeon","cooldownDays":-4}}`)
	if config.Throttle.PerMinute < 1 {
		t.Error("un debit a zero doit etre corrige")
	}
	if config.Reminders.Channel != "whatsapp" {
		t.Errorf("canal inconnu accepte : %q", config.Reminders.Channel)
	}
	if config.Reminders.CooldownDays < 1 {
		t.Error("un delai de courtoisie negatif relancerait le meme client en boucle")
	}
}

// Un secret jamais renseigne ne doit pas devenir une chaine « vide mais
// presente » apres un aller-retour : la couche API distingue les deux.
func TestEncodeRoundTrip(t *testing.T) {
	config := DefaultConfig()
	config.WhatsApp.APIKey = "cle-secrete"
	raw, err := config.Encode()
	if err != nil {
		t.Fatal(err)
	}
	if back := Parse(raw); back.WhatsApp.APIKey != "cle-secrete" {
		t.Errorf("cle perdue a la relecture : %q", back.WhatsApp.APIKey)
	}
}
