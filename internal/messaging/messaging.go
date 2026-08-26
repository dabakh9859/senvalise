// Package messaging porte les deux canaux sortants de SenValise : WhatsApp,
// via une passerelle WAHA, et le SMS, via l'API d'Orange Senegal.
//
// Le paquet ne connait ni la base ni Fiber. Il recoit une Config deja lue et
// rend des erreurs parlantes : c'est la couche API qui decide quoi journaliser
// et quoi reessayer. Cette separation permet de tester les clients sans base
// et d'ajouter un troisieme canal sans toucher aux appelants.
package messaging

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

// Config est l'etat complet de la messagerie, serialise dans le reglage
// « messaging_config ». Les secrets y figurent en clair : la table settings
// n'est lisible que par le gerant, et l'API les masque avant de repondre.
type Config struct {
	// PublicURL est l'adresse par laquelle un client atteint la boutique. Elle
	// sert a fabriquer les liens de documents envoyes par SMS, qui ne peuvent
	// rien joindre : sans elle, un SMS renverrait a nulle part.
	PublicURL string          `json:"publicUrl"`
	WhatsApp  WhatsAppConfig  `json:"whatsapp"`
	SMS       SMSConfig       `json:"sms"`
	Throttle  ThrottleConfig  `json:"throttle"`
	Reminders RemindersConfig `json:"reminders"`
	// StockAlert previent le responsable quand la marchandise manque. Le stock
	// bas ne se decouvre pas en ouvrant l'application : c'est la boutique qui
	// doit prevenir, pas le gerant qui doit penser a regarder.
	StockAlert StockAlertConfig `json:"stockAlert"`
}

// StockAlertConfig decrit l'alerte de rupture.
//
// Le numero est distinct de celui de la boutique : celui qui reapprovisionne
// n'est pas forcement celui qui repond aux clients, et une alerte de gestion
// n'a rien a faire sur la ligne du comptoir.
type StockAlertConfig struct {
	Enabled bool   `json:"enabled"`
	Phone   string `json:"phone"`
	Channel string `json:"channel"`
	// Hour est l'heure d'envoi, en heure locale du serveur. Une alerte a trois
	// heures du matin ne serait lue que le lendemain, et sonnerait pour rien.
	Hour int `json:"hour"`
	// OnlyWhenNeeded evite le message quotidien « tout va bien », qui finit par
	// ne plus etre lu — et fait rater celui qui compte.
	OnlyWhenNeeded bool `json:"onlyWhenNeeded"`
}

type WhatsAppConfig struct {
	Enabled bool   `json:"enabled"`
	BaseURL string `json:"baseUrl"`
	APIKey  string `json:"apiKey"`
	Session string `json:"session"`
}

// SMSConfig suit le vocabulaire d'Orange : une application declaree sur
// developer.orange.com donne un couple client id / secret, et un numero
// expediteur valide pour le pays. TokenURL et BaseURL restent parametrables
// car Orange fait varier ses domaines d'un pays a l'autre.
type SMSConfig struct {
	Enabled      bool   `json:"enabled"`
	ClientID     string `json:"clientId"`
	ClientSecret string `json:"clientSecret"`
	Sender       string `json:"sender"`
	SenderName   string `json:"senderName"`
	TokenURL     string `json:"tokenUrl"`
	BaseURL      string `json:"baseUrl"`
}

// ThrottleConfig protege le compte WhatsApp. Une diffusion envoyee d'un bloc
// est le motif de bannissement le plus courant : on impose donc un debit
// plafonne et un intervalle minimum entre deux messages.
type ThrottleConfig struct {
	PerMinute       int `json:"perMinute"`
	MinDelaySeconds int `json:"minDelaySeconds"`
}

// RemindersConfig pilote la relance des impayes. CooldownDays evite de
// harceler : un client relance hier ne l'est pas de nouveau aujourd'hui.
type RemindersConfig struct {
	Enabled      bool   `json:"enabled"`
	Channel      string `json:"channel"`
	MinAmount    int64  `json:"minAmount"`
	AfterDays    int    `json:"afterDays"`
	CooldownDays int    `json:"cooldownDays"`
	Body         string `json:"body"`
}

// DefaultConfig sert de socle : une installation neuve doit deja proposer des
// valeurs de travail, y compris le texte de relance, sinon le premier envoi
// part vide.
func DefaultConfig() Config {
	return Config{
		PublicURL: "https://senvalise.online",
		WhatsApp:  WhatsAppConfig{BaseURL: "http://127.0.0.1:3111", Session: "default"},
		SMS: SMSConfig{
			TokenURL: "https://api.orange.com/oauth/v3/token",
			BaseURL:  "https://api.orange.com/smsmessaging/v1/outbound",
		},
		Throttle:   ThrottleConfig{PerMinute: 12, MinDelaySeconds: 4},
		StockAlert: StockAlertConfig{Channel: "whatsapp", Hour: 8, OnlyWhenNeeded: true},
		Reminders: RemindersConfig{
			Channel: "whatsapp", MinAmount: 5000, AfterDays: 7, CooldownDays: 3,
			Body: "Bonjour {{nom}}, votre facture {{reference}} présente un solde de {{reste}}. " +
				"Merci de régulariser auprès de {{boutique}}. Pour toute question, répondez à ce message.",
		},
	}
}

// Normalise borne les reglages sensibles et retablit les valeurs par defaut
// perdues. Un debit a zero bloquerait toute la file sans message d'erreur ;
// un debit demesure ferait bannir le compte.
func (c *Config) Normalise() {
	base := DefaultConfig()
	c.PublicURL = strings.TrimRight(strings.TrimSpace(c.PublicURL), "/")
	c.WhatsApp.BaseURL = strings.TrimRight(strings.TrimSpace(c.WhatsApp.BaseURL), "/")
	if c.WhatsApp.BaseURL == "" {
		c.WhatsApp.BaseURL = base.WhatsApp.BaseURL
	}
	if strings.TrimSpace(c.WhatsApp.Session) == "" {
		c.WhatsApp.Session = base.WhatsApp.Session
	}
	c.SMS.TokenURL = strings.TrimSpace(c.SMS.TokenURL)
	if c.SMS.TokenURL == "" {
		c.SMS.TokenURL = base.SMS.TokenURL
	}
	c.SMS.BaseURL = strings.TrimRight(strings.TrimSpace(c.SMS.BaseURL), "/")
	if c.SMS.BaseURL == "" {
		c.SMS.BaseURL = base.SMS.BaseURL
	}
	if c.Throttle.PerMinute < 1 || c.Throttle.PerMinute > 60 {
		c.Throttle.PerMinute = base.Throttle.PerMinute
	}
	if c.Throttle.MinDelaySeconds < 1 || c.Throttle.MinDelaySeconds > 120 {
		c.Throttle.MinDelaySeconds = base.Throttle.MinDelaySeconds
	}
	c.StockAlert.Phone = strings.TrimSpace(c.StockAlert.Phone)
	if c.StockAlert.Channel != "sms" {
		c.StockAlert.Channel = "whatsapp"
	}
	// Une heure hors de la journee ferait sonner l'alerte quand personne ne la
	// lit, et une valeur absente vaudrait minuit.
	if c.StockAlert.Hour < 0 || c.StockAlert.Hour > 23 {
		c.StockAlert.Hour = base.StockAlert.Hour
	}
	if c.Reminders.Channel != "sms" {
		c.Reminders.Channel = "whatsapp"
	}
	if c.Reminders.CooldownDays < 1 {
		c.Reminders.CooldownDays = base.Reminders.CooldownDays
	}
	if c.Reminders.AfterDays < 0 {
		c.Reminders.AfterDays = 0
	}
	if c.Reminders.MinAmount < 0 {
		c.Reminders.MinAmount = 0
	}
	if strings.TrimSpace(c.Reminders.Body) == "" {
		c.Reminders.Body = base.Reminders.Body
	}
}

// Parse lit la configuration stockee. Un reglage absent ou corrompu ne doit
// pas empecher l'ecran de s'ouvrir : on retombe sur les valeurs par defaut.
func Parse(raw string) Config {
	config := DefaultConfig()
	if strings.TrimSpace(raw) != "" {
		_ = json.Unmarshal([]byte(raw), &config)
	}
	config.Normalise()
	return config
}

func (c Config) Encode() (string, error) {
	raw, err := json.Marshal(c)
	return string(raw), err
}

// ---------- numeros ----------

var digits = regexp.MustCompile(`\D+`)

// DefaultCountry est l'indicatif du Senegal. Les fiches clients melangent les
// formats (77 123 45 67, 00221…, +221…) ; sans normalisation, le meme client
// recevrait deux fois le message ou aucun.
const DefaultCountry = "221"

// NormalisePhone rend un numero international sans « + », ou une chaine vide
// si le numero est inexploitable. Les mobiles senegalais ont neuf chiffres et
// commencent par 7 : cette regle attrape les fixes et les saisies tronquees
// avant qu'un envoi ne parte dans le vide.
func NormalisePhone(raw string) string {
	value := digits.ReplaceAllString(raw, "")
	value = strings.TrimPrefix(value, "00")
	switch {
	case len(value) == 9 && strings.HasPrefix(value, "7"):
		value = DefaultCountry + value
	case len(value) == 10 && strings.HasPrefix(value, "07"):
		// Saisie calquee sur les fixes francais : le zero de tete ne fait pas
		// partie du numero senegalais.
		value = DefaultCountry + value[1:]
	}
	if len(value) < 11 || len(value) > 15 {
		return ""
	}
	return value
}

// ChatID est l'adresse d'un correspondant chez WAHA.
func ChatID(phone string) string {
	value := NormalisePhone(phone)
	if value == "" {
		return ""
	}
	return value + "@c.us"
}

// InternationalPhone rend la forme « +221771234567 » attendue par Orange.
func InternationalPhone(phone string) string {
	value := NormalisePhone(phone)
	if value == "" {
		return ""
	}
	return "+" + value
}

// ---------- modeles ----------

var placeholder = regexp.MustCompile(`{{\s*([a-zA-Z0-9_]+)\s*}}`)

// Render remplace les jetons {{nom}} d'un modele. Un jeton inconnu est efface
// plutot que laisse tel quel : un client ne doit jamais recevoir « {{reste}} »
// au milieu d'une phrase.
func Render(template string, values map[string]string) string {
	return placeholder.ReplaceAllStringFunc(template, func(token string) string {
		key := strings.ToLower(strings.Trim(token, "{} \t"))
		return values[key]
	})
}

// Placeholders liste les jetons proposes a l'ecran. Le tableau sert aussi
// d'aide-memoire : ce qui n'y figure pas n'est pas alimente par le serveur.
var Placeholders = []string{"nom", "telephone", "reference", "date", "montant", "paye", "reste", "echeance", "lien", "boutique"}

// Money met en forme un montant en francs CFA avec des espaces insecables
// fines, comme le reste de l'application.
func Money(amount int64) string {
	sign := ""
	if amount < 0 {
		sign, amount = "-", -amount
	}
	raw := fmt.Sprintf("%d", amount)
	var parts []string
	for len(raw) > 3 {
		parts = append([]string{raw[len(raw)-3:]}, parts...)
		raw = raw[:len(raw)-3]
	}
	parts = append([]string{raw}, parts...)
	return sign + strings.Join(parts, " ") + " F"
}
