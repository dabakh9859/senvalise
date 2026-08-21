package messaging

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// WAHA est le client de la passerelle WhatsApp. Elle tourne a cote de l'API,
// sur la boucle locale : aucun secret ne circule sur le reseau, et la cle
// d'API reste une seconde barriere si le port venait a etre expose.
type WAHA struct {
	BaseURL string
	APIKey  string
	Session string
	client  *http.Client
}

func NewWAHA(config WhatsAppConfig) *WAHA {
	session := strings.TrimSpace(config.Session)
	if session == "" {
		session = "default"
	}
	return &WAHA{
		BaseURL: strings.TrimRight(config.BaseURL, "/"),
		APIKey:  config.APIKey,
		Session: session,
		// Un envoi WhatsApp passe par un navigateur pilote : trente secondes
		// sont necessaires au demarrage a froid, et suffisantes ensuite.
		client: &http.Client{Timeout: 30 * time.Second},
	}
}

// SessionStatus reprend le vocabulaire de WAHA. WORKING est le seul etat qui
// autorise un envoi ; SCAN_QR_CODE demande une action humaine.
type SessionStatus struct {
	Name   string `json:"name"`
	Status string `json:"status"`
	Me     *struct {
		ID       string `json:"id"`
		PushName string `json:"pushName"`
	} `json:"me"`
}

func (w *WAHA) do(method, path string, body any) (int, []byte, error) {
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return 0, nil, err
		}
		reader = bytes.NewReader(raw)
	}
	request, err := http.NewRequest(method, w.BaseURL+path, reader)
	if err != nil {
		return 0, nil, err
	}
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	if w.APIKey != "" {
		request.Header.Set("X-Api-Key", w.APIKey)
	}
	response, err := w.client.Do(request)
	if err != nil {
		// L'adresse de la passerelle est une erreur de configuration frequente :
		// on la cite, sinon le message ne dit pas ou chercher.
		return 0, nil, fmt.Errorf("passerelle WhatsApp injoignable sur %s", w.BaseURL)
	}
	defer response.Body.Close()
	payload, err := io.ReadAll(io.LimitReader(response.Body, 4<<20))
	return response.StatusCode, payload, err
}

// apiError traduit une reponse WAHA en message metier. WAHA repond soit
// {"message": …}, soit {"error": …} selon la version et la couche fautive.
func apiError(status int, payload []byte) error {
	var out struct {
		Message any    `json:"message"`
		Error   string `json:"error"`
	}
	_ = json.Unmarshal(payload, &out)
	detail := out.Error
	switch value := out.Message.(type) {
	case string:
		if value != "" {
			detail = value
		}
	case []any:
		if len(value) > 0 {
			detail = fmt.Sprint(value[0])
		}
	}
	if detail == "" {
		detail = strings.TrimSpace(string(payload))
	}
	if len(detail) > 300 {
		detail = detail[:300]
	}
	if detail == "" {
		detail = fmt.Sprintf("erreur %d", status)
	}
	return fmt.Errorf("WhatsApp : %s", translate(detail))
}

// translate rend en francais les refus courants de WAHA. Ces messages
// remontent tels quels dans la colonne « motif » de l'ecran des campagnes :
// le gerant doit pouvoir agir sans lire l'anglais, et la cause tient presque
// toujours a l'un de ces trois cas.
func translate(detail string) string {
	lower := strings.ToLower(detail)
	switch {
	case strings.Contains(lower, "session status is not as expected"),
		strings.Contains(lower, "session is not working"):
		return "la session n'est pas connectée — appairez le téléphone depuis Paramètres › WhatsApp et SMS"
	case strings.Contains(lower, "session not found"):
		return "session absente — démarrez-la depuis Paramètres › WhatsApp et SMS"
	case strings.Contains(lower, "not registered"), strings.Contains(lower, "number does not exist"),
		strings.Contains(lower, "phone number is not registered"):
		return "ce numéro n'a pas de compte WhatsApp"
	case strings.Contains(lower, "unauthorized"), strings.Contains(lower, "api key"):
		return "clé d'API refusée par la passerelle"
	}
	return detail
}

// Status lit l'etat de la session. Une session jamais creee remonte un 404 :
// ce n'est pas une panne, c'est l'etat initial, et l'ecran doit pouvoir le
// presenter comme tel.
func (w *WAHA) Status() (SessionStatus, error) {
	status, payload, err := w.do(http.MethodGet, "/api/sessions/"+w.Session, nil)
	if err != nil {
		return SessionStatus{}, err
	}
	if status == http.StatusNotFound {
		return SessionStatus{Name: w.Session, Status: "STOPPED"}, nil
	}
	if status >= 300 {
		return SessionStatus{}, apiError(status, payload)
	}
	var out SessionStatus
	if err := json.Unmarshal(payload, &out); err != nil {
		return SessionStatus{}, err
	}
	if out.Status == "" {
		out.Status = "UNKNOWN"
	}
	return out, nil
}

// Start cree la session si besoin puis la demarre. WAHA a change d'API entre
// versions : creer une session existante rend 422 et demarrer une session deja
// active rend 422 aussi. Les deux cas sont des succes de notre point de vue —
// ce qui compte est qu'elle tourne apres l'appel.
func (w *WAHA) Start() error {
	status, payload, err := w.do(http.MethodPost, "/api/sessions", map[string]any{
		"name": w.Session, "start": true,
	})
	if err != nil {
		return err
	}
	if status < 300 || status == http.StatusUnprocessableEntity || status == http.StatusConflict {
		// La session existe : on force le demarrage, sans quoi une session
		// arretee resterait arretee.
		startStatus, startPayload, startErr := w.do(http.MethodPost, "/api/sessions/"+w.Session+"/start", nil)
		if startErr != nil {
			return startErr
		}
		if startStatus >= 300 && startStatus != http.StatusUnprocessableEntity && startStatus != http.StatusConflict && startStatus != http.StatusNotFound {
			return apiError(startStatus, startPayload)
		}
		return nil
	}
	return apiError(status, payload)
}

func (w *WAHA) Stop() error {
	status, payload, err := w.do(http.MethodPost, "/api/sessions/"+w.Session+"/stop", nil)
	if err != nil {
		return err
	}
	if status >= 300 && status != http.StatusNotFound && status != http.StatusUnprocessableEntity {
		return apiError(status, payload)
	}
	return nil
}

// Logout deconnecte le telephone. C'est l'operation a lancer avant de changer
// de numero : arreter la session ne suffit pas, l'appairage survivrait.
func (w *WAHA) Logout() error {
	status, payload, err := w.do(http.MethodPost, "/api/sessions/"+w.Session+"/logout", nil)
	if err != nil {
		return err
	}
	if status >= 300 && status != http.StatusNotFound && status != http.StatusUnprocessableEntity {
		return apiError(status, payload)
	}
	return nil
}

// QR rend le code d'appairage en PNG encode en base64, pret a etre pose dans
// un attribut src. Le code expire en une vingtaine de secondes : l'ecran le
// redemande en boucle tant que la session n'est pas appairee.
func (w *WAHA) QR() (string, error) {
	status, payload, err := w.do(http.MethodGet, "/api/"+w.Session+"/auth/qr?format=image", nil)
	if err != nil {
		return "", err
	}
	if status >= 300 {
		return "", apiError(status, payload)
	}
	// Selon la version, WAHA rend l'image brute ou un objet {mimetype, data}.
	if bytes.HasPrefix(payload, []byte("\x89PNG")) {
		return "data:image/png;base64," + base64.StdEncoding.EncodeToString(payload), nil
	}
	var out struct {
		Mimetype string `json:"mimetype"`
		Data     string `json:"data"`
	}
	if json.Unmarshal(payload, &out) == nil && out.Data != "" {
		mime := out.Mimetype
		if mime == "" {
			mime = "image/png"
		}
		return "data:" + mime + ";base64," + out.Data, nil
	}
	return "", fmt.Errorf("code QR illisible")
}

// SendText envoie un message simple et rend l'identifiant WhatsApp du message.
func (w *WAHA) SendText(chatID, text string) (string, error) {
	return w.send("/api/sendText", map[string]any{
		"session": w.Session, "chatId": chatID, "text": text,
	})
}

// SendFile joint un document. Le fichier part en base64 dans la requete
// plutot que par une URL : la passerelle n'a ainsi jamais besoin de joindre
// notre serveur, ce qui evite d'exposer les factures a l'exterieur.
func (w *WAHA) SendFile(chatID, filename, mimetype string, data []byte, caption string) (string, error) {
	return w.send("/api/sendFile", map[string]any{
		"session": w.Session, "chatId": chatID, "caption": caption,
		"file": map[string]string{
			"mimetype": mimetype,
			"filename": filename,
			"data":     base64.StdEncoding.EncodeToString(data),
		},
	})
}

func (w *WAHA) send(path string, body map[string]any) (string, error) {
	status, payload, err := w.do(http.MethodPost, path, body)
	if err != nil {
		return "", err
	}
	if status >= 300 {
		return "", apiError(status, payload)
	}
	var out struct {
		ID any `json:"id"`
	}
	_ = json.Unmarshal(payload, &out)
	switch value := out.ID.(type) {
	case string:
		return value, nil
	case map[string]any:
		// Les versions recentes rendent un identifiant structure
		// {fromMe, remote, id}.
		if raw, ok := value["_serialized"].(string); ok {
			return raw, nil
		}
		if raw, ok := value["id"].(string); ok {
			return raw, nil
		}
	}
	return "", nil
}

// CheckNumber verifie qu'un numero possede bien un compte WhatsApp. Un envoi
// vers un numero absent de WhatsApp echoue en silence chez certains moteurs :
// mieux vaut le savoir avant de compter le message comme distribue.
func (w *WAHA) CheckNumber(phone string) (bool, error) {
	value := NormalisePhone(phone)
	if value == "" {
		return false, fmt.Errorf("numero invalide")
	}
	status, payload, err := w.do(http.MethodGet, "/api/contacts/check-exists?phone="+value+"&session="+w.Session, nil)
	if err != nil {
		return false, err
	}
	if status >= 300 {
		// La verification n'est pas disponible partout : on n'en fait pas un
		// echec bloquant, l'envoi tranchera.
		return true, nil
	}
	var out struct {
		NumberExists bool `json:"numberExists"`
	}
	if json.Unmarshal(payload, &out) != nil {
		return true, nil
	}
	return out.NumberExists, nil
}
