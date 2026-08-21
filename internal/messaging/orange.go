package messaging

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// Orange est le client de l'API SMS d'Orange Senegal (Orange Developer,
// « SMS Senegal »). Le protocole tient en deux appels : un jeton OAuth2 en
// « client credentials », puis un POST par message.
//
// Le jeton vit une heure et son obtention est facturee comme un appel : il est
// donc garde en memoire et partage entre les envois d'une meme diffusion.
type Orange struct {
	config SMSConfig
	client *http.Client

	mu      sync.Mutex
	token   string
	expires time.Time
}

func NewOrange(config SMSConfig) *Orange {
	return &Orange{config: config, client: &http.Client{Timeout: 20 * time.Second}}
}

// Configured dit si les trois valeurs indispensables sont presentes. Sans
// elles, la file doit rejeter le message tout de suite plutot que de tenter un
// appel qui rendra un 401.
func (o *Orange) Configured() bool {
	return strings.TrimSpace(o.config.ClientID) != "" &&
		strings.TrimSpace(o.config.ClientSecret) != "" &&
		InternationalPhone(o.config.Sender) != ""
}

// Token rend un jeton valide, en le renouvelant une minute avant l'echeance
// pour ne pas partir avec un jeton qui expire pendant l'appel.
func (o *Orange) Token() (string, error) {
	o.mu.Lock()
	defer o.mu.Unlock()
	if o.token != "" && time.Now().Before(o.expires.Add(-time.Minute)) {
		return o.token, nil
	}
	form := url.Values{"grant_type": {"client_credentials"}}
	request, err := http.NewRequest(http.MethodPost, o.config.TokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	credentials := base64.StdEncoding.EncodeToString([]byte(o.config.ClientID + ":" + o.config.ClientSecret))
	request.Header.Set("Authorization", "Basic "+credentials)
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	request.Header.Set("Accept", "application/json")
	response, err := o.client.Do(request)
	if err != nil {
		return "", fmt.Errorf("Orange SMS injoignable : %v", err)
	}
	defer response.Body.Close()
	payload, _ := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if response.StatusCode >= 300 {
		return "", orangeError(response.StatusCode, payload)
	}
	var out struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int64  `json:"expires_in"`
		TokenType   string `json:"token_type"`
	}
	if err := json.Unmarshal(payload, &out); err != nil || out.AccessToken == "" {
		return "", fmt.Errorf("Orange SMS : jeton illisible")
	}
	if out.ExpiresIn <= 0 {
		out.ExpiresIn = 3600
	}
	o.token, o.expires = out.AccessToken, time.Now().Add(time.Duration(out.ExpiresIn)*time.Second)
	return o.token, nil
}

// Send emet un SMS et rend la reference d'Orange. Le corps suit le modele
// « OneAPI » : l'adresse de l'expediteur apparait a la fois dans l'URL et dans
// la charge utile, Orange rejette la requete si les deux different.
func (o *Orange) Send(phone, text string) (string, error) {
	if !o.Configured() {
		return "", fmt.Errorf("SMS : identifiants Orange incomplets")
	}
	recipient := InternationalPhone(phone)
	if recipient == "" {
		return "", fmt.Errorf("SMS : numero de destinataire invalide")
	}
	sender := InternationalPhone(o.config.Sender)
	token, err := o.Token()
	if err != nil {
		return "", err
	}
	body := map[string]any{
		"outboundSMSMessageRequest": map[string]any{
			"address":                []string{"tel:" + recipient},
			"senderAddress":          "tel:" + sender,
			"outboundSMSTextMessage": map[string]string{"message": text},
			"senderName":             strings.TrimSpace(o.config.SenderName),
		},
	}
	if strings.TrimSpace(o.config.SenderName) == "" {
		// Orange refuse un senderName vide : on retire la cle plutot que de
		// l'envoyer a blanc.
		delete(body["outboundSMSMessageRequest"].(map[string]any), "senderName")
	}
	raw, err := json.Marshal(body)
	if err != nil {
		return "", err
	}
	endpoint := fmt.Sprintf("%s/tel:%s/requests", o.config.BaseURL, url.PathEscape(sender))
	request, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(raw))
	if err != nil {
		return "", err
	}
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "application/json")
	response, err := o.client.Do(request)
	if err != nil {
		return "", fmt.Errorf("Orange SMS injoignable : %v", err)
	}
	defer response.Body.Close()
	payload, _ := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if response.StatusCode == http.StatusUnauthorized {
		// Jeton revoque avant son echeance : on l'oublie pour que la tentative
		// suivante en demande un neuf.
		o.mu.Lock()
		o.token, o.expires = "", time.Time{}
		o.mu.Unlock()
	}
	if response.StatusCode >= 300 {
		return "", orangeError(response.StatusCode, payload)
	}
	var out struct {
		Outbound struct {
			ResourceURL string `json:"resourceURL"`
		} `json:"outboundSMSMessageRequest"`
	}
	_ = json.Unmarshal(payload, &out)
	return out.Outbound.ResourceURL, nil
}

// orangeError deplie les enveloppes d'erreur d'Orange, qui varient selon la
// couche fautive (passerelle OAuth, politique d'usage, service SMS).
func orangeError(status int, payload []byte) error {
	var out struct {
		Error            string `json:"error"`
		ErrorDescription string `json:"error_description"`
		Description      string `json:"description"`
		Fault            struct {
			FaultString string `json:"faultstring"`
		} `json:"fault"`
		RequestError struct {
			ServiceException struct {
				Text      string `json:"text"`
				MessageID string `json:"messageId"`
			} `json:"serviceException"`
			PolicyException struct {
				Text      string `json:"text"`
				MessageID string `json:"messageId"`
			} `json:"policyException"`
		} `json:"requestError"`
	}
	_ = json.Unmarshal(payload, &out)
	for _, candidate := range []string{
		out.RequestError.ServiceException.Text,
		out.RequestError.PolicyException.Text,
		out.ErrorDescription,
		out.Description,
		out.Fault.FaultString,
		out.Error,
	} {
		if strings.TrimSpace(candidate) != "" {
			return fmt.Errorf("Orange SMS : %s", candidate)
		}
	}
	detail := strings.TrimSpace(string(payload))
	if len(detail) > 300 {
		detail = detail[:300]
	}
	if detail == "" {
		detail = fmt.Sprintf("erreur %d", status)
	}
	return fmt.Errorf("Orange SMS : %s", detail)
}

// SMSParts compte les segments factures. Un accent bascule le message en
// UCS-2, ou un segment ne porte que 70 caracteres au lieu de 160 : la
// difference se voit sur la facture d'une diffusion de masse, et l'ecran doit
// pouvoir l'annoncer avant l'envoi.
func SMSParts(text string) (int, bool) {
	unicode := false
	for _, r := range text {
		if r > 127 {
			unicode = true
			break
		}
	}
	length := len([]rune(text))
	single, multi := 160, 153
	if unicode {
		single, multi = 70, 67
	}
	if length <= single {
		return 1, unicode
	}
	parts := length / multi
	if length%multi != 0 {
		parts++
	}
	return parts, unicode
}
