package models

import "time"

type Base struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}
type User struct {
	Base
	Name         string `json:"name"`
	Email        string `json:"email" gorm:"uniqueIndex"`
	PasswordHash string `json:"-"`
	Role         string `json:"role" gorm:"default:vendor"`
	Active       bool   `json:"active" gorm:"default:true"`
}
type Category struct {
	Base
	Name        string `json:"name"`
	Slug        string `json:"slug" gorm:"uniqueIndex"`
	Description string `json:"description"`
}
type Brand struct {
	Base
	Name string `json:"name"`
	Slug string `json:"slug" gorm:"uniqueIndex"`
}
type Supplier struct {
	Base
	Name    string `json:"name"`
	Phone   string `json:"phone"`
	Email   string `json:"email"`
	Address string `json:"address"`
}
type Customer struct {
	Base
	Name            string            `json:"name"`
	PasswordHash    string            `json:"-"`
	Active          bool              `json:"active" gorm:"default:true"`
	Phone           string            `json:"phone" gorm:"index"`
	Email           string            `json:"email" gorm:"index"`
	Address         string            `json:"address"`
	Zone            string            `json:"zone"`
	WhatsAppConsent bool              `json:"whatsappConsent"`
	Addresses       []CustomerAddress `json:"addresses,omitempty"`
}

// Le site permet plusieurs adresses nommees ; la colonne Address du client
// reste l'adresse de facturation utilisee au comptoir.
type CustomerAddress struct {
	Base
	CustomerID uint   `json:"customerId" gorm:"index"`
	Label      string `json:"label"`
	Zone       string `json:"zone"`
	Detail     string `json:"detail"`
	IsDefault  bool   `json:"isDefault"`
}
type Product struct {
	Base
	Name        string            `json:"name"`
	Slug        string            `json:"slug" gorm:"uniqueIndex"`
	Description string            `json:"description"`
	CategoryID  *uint             `json:"categoryId"`
	BrandID     *uint             `json:"brandId"`
	Active      bool              `json:"active" gorm:"default:true"`
	Online      bool              `json:"online"`
	Featured    bool              `json:"featured"`
	Blurb       string            `json:"blurb"`
	Tag         string            `json:"tag"`
	Flag        string            `json:"flag"`
	Cabin       bool              `json:"cabin"`
	Volume      int               `json:"volume"`
	Weight      float64           `json:"weight"`
	Position    int               `json:"position"`
	Variants    []ProductVariant  `json:"variants,omitempty"`
	Images      []ProductImage    `json:"images,omitempty"`
	Specs       []ProductSpec     `json:"specs,omitempty"`
	Colorways   []ProductColorway `json:"colorways,omitempty"`
}

// Une ligne du tableau de caracteristiques de la fiche produit.
type ProductSpec struct {
	Base
	ProductID uint   `json:"productId" gorm:"index"`
	Label     string `json:"label"`
	Value     string `json:"value"`
	Position  int    `json:"position"`
}

// Teintes proposees pour un produit sur la vitrine. Volontairement separe des
// variantes : une variante porte un SKU et du stock, c'est l'affaire de la
// gestion ; la liste des teintes affichees est du contenu de boutique.
type ProductColorway struct {
	Base
	ProductID uint   `json:"productId" gorm:"index"`
	Slug      string `json:"slug"`
	Position  int    `json:"position"`
}

// Teintes nommees du catalogue : la variante porte le slug, la boutique
// affiche le nom et la pastille de couleur.
type Colorway struct {
	Base
	Slug     string `json:"slug" gorm:"uniqueIndex"`
	Name     string `json:"name"`
	Hex      string `json:"hex"`
	Position int    `json:"position"`
}
type ProductImage struct {
	Base
	ProductID uint   `json:"productId" gorm:"index"`
	URL       string `json:"url"`
	Alt       string `json:"alt"`
	Position  int    `json:"position"`
	Primary   bool   `json:"primary"`
}
type ProductVariant struct {
	Base
	ProductID uint     `json:"productId" gorm:"index"`
	SKU       string   `json:"sku" gorm:"uniqueIndex"`
	Barcode   string   `json:"barcode" gorm:"uniqueIndex"`
	Color     string   `json:"color"`
	Size      string   `json:"size"`
	Cost      int64    `json:"cost"`
	Price     int64    `json:"price"`
	Stock     int64    `json:"stock"`
	AlertAt   int64    `json:"alertAt"`
	Active    bool     `json:"active" gorm:"default:true"`
	Product   *Product `json:"product,omitempty" gorm:"foreignKey:ProductID"`
}
type StockMovement struct {
	Base
	VariantID   uint   `json:"variantId" gorm:"index"`
	UserID      uint   `json:"userId"`
	Type        string `json:"type"`
	Reason      string `json:"reason"`
	Quantity    int64  `json:"quantity"`
	StockBefore int64  `json:"stockBefore"`
	StockAfter  int64  `json:"stockAfter"`
	Reference   string `json:"reference" gorm:"index"`
	Note        string `json:"note"`
}
type Arrival struct {
	Base
	Reference    string        `json:"reference" gorm:"uniqueIndex"`
	SupplierID   *uint         `json:"supplierId"`
	Status       string        `json:"status" gorm:"default:draft"`
	Currency     string        `json:"currency"`
	ExchangeRate float64       `json:"exchangeRate"`
	Shipping     int64         `json:"shipping"`
	Customs      int64         `json:"customs"`
	OtherFees    int64         `json:"otherFees"`
	ReceivedAt   *time.Time    `json:"receivedAt"`
	Items        []ArrivalItem `json:"items,omitempty"`
}
type ArrivalItem struct {
	Base
	ArrivalID  uint  `json:"arrivalId"`
	VariantID  uint  `json:"variantId"`
	Quantity   int64 `json:"quantity"`
	UnitCost   int64 `json:"unitCost"`
	LandedCost int64 `json:"landedCost"`
}
type Sale struct {
	Base
	Reference            string        `json:"reference" gorm:"uniqueIndex"`
	QuoteID              *uint         `json:"quoteId" gorm:"uniqueIndex"`
	CustomerID           *uint         `json:"customerId"`
	UserID               uint          `json:"userId"`
	Channel              string        `json:"channel"`
	Status               string        `json:"status"`
	PaymentMethod        string        `json:"paymentMethod"`
	Subtotal             int64         `json:"subtotal"`
	Discount             int64         `json:"discount"`
	TaxRate              float64       `json:"taxRate"`
	Tax                  int64         `json:"tax"`
	Total                int64         `json:"total"`
	Paid                 int64         `json:"paid"`
	InvoiceCompanyName   string        `json:"invoiceCompanyName"`
	InvoiceTagline       string        `json:"invoiceTagline"`
	InvoicePhone         string        `json:"invoicePhone"`
	InvoiceAddress       string        `json:"invoiceAddress"`
	InvoiceThankYouTitle string        `json:"invoiceThankYouTitle"`
	InvoiceFooterNote    string        `json:"invoiceFooterNote"`
	ClientSignatureURL   string        `json:"clientSignatureUrl"`
	CompanySignatureURL  string        `json:"companySignatureUrl"`
	Items                []SaleItem    `json:"items,omitempty"`
	Payments             []SalePayment `json:"payments,omitempty"`
	Customer             *Customer     `json:"customer,omitempty" gorm:"foreignKey:CustomerID"`
	User                 *User         `json:"user,omitempty" gorm:"foreignKey:UserID"`
	Quote                *Quote        `json:"quote,omitempty" gorm:"foreignKey:QuoteID"`
	DeliveryNote         *DeliveryNote `json:"deliveryNote,omitempty" gorm:"foreignKey:SaleID"`
}
type SaleItem struct {
	Base
	SaleID    uint            `json:"saleId"`
	VariantID uint            `json:"variantId"`
	Quantity  int64           `json:"quantity"`
	UnitPrice int64           `json:"unitPrice"`
	UnitCost  int64           `json:"unitCost"`
	Discount  int64           `json:"discount"`
	Total     int64           `json:"total"`
	Variant   *ProductVariant `json:"variant,omitempty" gorm:"foreignKey:VariantID"`
}
type SalePayment struct {
	Base
	SaleID       uint       `json:"saleId" gorm:"index"`
	UserID       uint       `json:"userId"`
	Method       string     `json:"method"`
	Amount       int64      `json:"amount"`
	Status       string     `json:"status" gorm:"default:active"`
	Reference    string     `json:"reference"`
	CancelReason string     `json:"cancelReason"`
	CancelledAt  *time.Time `json:"cancelledAt"`
}
type SaleReturn struct {
	Base
	Reference    string       `json:"reference" gorm:"uniqueIndex"`
	SaleID       uint         `json:"saleId"`
	UserID       uint         `json:"userId"`
	Reason       string       `json:"reason"`
	RefundMethod string       `json:"refundMethod"`
	Amount       int64        `json:"amount"`
	Restock      bool         `json:"restock"`
	Items        []ReturnItem `json:"items,omitempty"`
}
type ReturnItem struct {
	Base
	SaleReturnID uint  `json:"saleReturnId"`
	VariantID    uint  `json:"variantId"`
	Quantity     int64 `json:"quantity"`
	Amount       int64 `json:"amount"`
}
type Document struct {
	Base
	Reference  string         `json:"reference" gorm:"uniqueIndex"`
	Type       string         `json:"type"`
	Status     string         `json:"status"`
	CustomerID *uint          `json:"customerId"`
	SaleID     *uint          `json:"saleId"`
	ParentID   *uint          `json:"parentId"`
	Total      int64          `json:"total"`
	DueAt      *time.Time     `json:"dueAt"`
	Notes      string         `json:"notes"`
	Items      []DocumentItem `json:"items,omitempty"`
}
type DocumentItem struct {
	Base
	DocumentID  uint   `json:"documentId"`
	Description string `json:"description"`
	Quantity    int64  `json:"quantity"`
	UnitPrice   int64  `json:"unitPrice"`
	Total       int64  `json:"total"`
}

// Quote is a commercial proposal. Once accepted it is converted into one Sale,
// which is the invoice in SenValise.
type Quote struct {
	Base
	Reference           string      `json:"reference" gorm:"uniqueIndex"`
	Status              string      `json:"status"`
	CustomerID          *uint       `json:"customerId"`
	UserID              uint        `json:"userId"`
	ConvertedSaleID     *uint       `json:"convertedSaleId"`
	Subtotal            int64       `json:"subtotal"`
	Discount            int64       `json:"discount"`
	TaxRate             float64     `json:"taxRate"`
	Tax                 int64       `json:"tax"`
	Total               int64       `json:"total"`
	ValidUntil          *time.Time  `json:"validUntil"`
	Notes               string      `json:"notes"`
	ClientSignatureURL  string      `json:"clientSignatureUrl"`
	CompanySignatureURL string      `json:"companySignatureUrl"`
	Items               []QuoteItem `json:"items,omitempty"`
	Customer            *Customer   `json:"customer,omitempty" gorm:"foreignKey:CustomerID"`
	User                *User       `json:"user,omitempty" gorm:"foreignKey:UserID"`
	ConvertedSale       *Sale       `json:"convertedSale,omitempty" gorm:"foreignKey:ConvertedSaleID"`
}
type QuoteItem struct {
	Base
	QuoteID     uint            `json:"quoteId"`
	VariantID   uint            `json:"variantId"`
	Description string          `json:"description"`
	Quantity    int64           `json:"quantity"`
	UnitPrice   int64           `json:"unitPrice"`
	Discount    int64           `json:"discount"`
	Total       int64           `json:"total"`
	Variant     *ProductVariant `json:"variant,omitempty" gorm:"foreignKey:VariantID"`
}

// DeliveryNote is generated from an invoice and retains its invoice link.
type DeliveryNote struct {
	Base
	Reference           string             `json:"reference" gorm:"uniqueIndex"`
	Status              string             `json:"status"`
	SaleID              uint               `json:"saleId" gorm:"uniqueIndex"`
	CustomerID          *uint              `json:"customerId"`
	UserID              uint               `json:"userId"`
	Notes               string             `json:"notes"`
	ClientSignatureURL  string             `json:"clientSignatureUrl"`
	CompanySignatureURL string             `json:"companySignatureUrl"`
	Items               []DeliveryNoteItem `json:"items,omitempty"`
	Customer            *Customer          `json:"customer,omitempty" gorm:"foreignKey:CustomerID"`
	User                *User              `json:"user,omitempty" gorm:"foreignKey:UserID"`
	Sale                *Sale              `json:"sale,omitempty" gorm:"foreignKey:SaleID"`
}
type DeliveryNoteItem struct {
	Base
	DeliveryNoteID uint            `json:"deliveryNoteId"`
	VariantID      uint            `json:"variantId"`
	Description    string          `json:"description"`
	Quantity       int64           `json:"quantity"`
	Variant        *ProductVariant `json:"variant,omitempty" gorm:"foreignKey:VariantID"`
}
type Order struct {
	Base
	Reference     string      `json:"reference" gorm:"uniqueIndex"`
	CustomerID    uint        `json:"customerId"`
	// SaleID relie la commande web a la facture emise en gestion. Il rend la
	// conversion tracable et empeche de facturer deux fois la meme commande.
	SaleID        *uint       `json:"saleId"`
	Status        string      `json:"status"`
	PaymentMethod string      `json:"paymentMethod"`
	Total         int64       `json:"total"`
	DeliveryFee   int64       `json:"deliveryFee"`
	DeliveryZone  string      `json:"deliveryZone"`
	Address       string      `json:"address"`
	Items         []OrderItem `json:"items,omitempty"`
}
type OrderItem struct {
	Base
	OrderID     uint   `json:"orderId"`
	VariantID   uint   `json:"variantId"`
	ProductName string `json:"productName"`
	Quantity    int64  `json:"quantity"`
	UnitPrice   int64  `json:"unitPrice"`
	Total       int64  `json:"total"`
}
type Vault struct {
	Base
	CustomerID uint           `json:"customerId" gorm:"uniqueIndex"`
	Balance    int64          `json:"balance"`
	Goal       int64          `json:"goal"`
	GoalRef    string         `json:"goalRef"`
	Status     string         `json:"status"`
	Deposits   []VaultDeposit `json:"deposits,omitempty"`
}
type VaultDeposit struct {
	Base
	VaultID   uint   `json:"vaultId"`
	Amount    int64  `json:"amount"`
	Method    string `json:"method"`
	Reference string `json:"reference"`
}
type CashSession struct {
	Base
	UserID         uint           `json:"userId"`
	Status         string         `json:"status"`
	OpeningAmount  int64          `json:"openingAmount"`
	ExpectedAmount int64          `json:"expectedAmount"`
	ClosingAmount  int64          `json:"closingAmount"`
	OpenedAt       time.Time      `json:"openedAt"`
	ClosedAt       *time.Time     `json:"closedAt"`
	Movements      []CashMovement `json:"movements,omitempty"`
}
type CashMovement struct {
	Base
	CashSessionID uint   `json:"cashSessionId"`
	UserID        uint   `json:"userId"`
	Direction     string `json:"direction"`
	Category      string `json:"category"`
	Amount        int64  `json:"amount"`
	Note          string `json:"note"`
}
type Message struct {
	Base
	CustomerID *uint      `json:"customerId"`
	Channel    string     `json:"channel"`
	Type       string     `json:"type"`
	Status     string     `json:"status"`
	Recipient  string     `json:"recipient"`
	Subject    string     `json:"subject"`
	Body       string     `json:"body"`
	Error      string     `json:"error"`
	SentAt     *time.Time `json:"sentAt"`
}
type MessageTemplate struct {
	Base
	Name    string `json:"name"`
	Channel string `json:"channel"`
	Type    string `json:"type"`
	Subject string `json:"subject"`
	Body    string `json:"body"`
}
type HomeBlock struct {
	Base
	Kind     string `json:"kind"`
	Title    string `json:"title"`
	Body     string `json:"body"`
	ImageURL string `json:"imageUrl"`
	Link     string `json:"link"`
	Position int    `json:"position"`
	Active   bool   `json:"active"`
}
type ActivityLog struct {
	Base
	UserID   uint   `json:"userId"`
	Action   string `json:"action"`
	Entity   string `json:"entity"`
	EntityID uint   `json:"entityId"`
	Details  string `json:"details"`
}
type Setting struct {
	Base
	Key    string `json:"key" gorm:"uniqueIndex"`
	Value  string `json:"value"`
	Secret bool   `json:"secret"`
}
type DeliveryZone struct {
	Base
	Slug   string  `json:"slug" gorm:"uniqueIndex"`
	Name   string  `json:"name"`
	Area   string  `json:"area"`
	Lat    float64 `json:"lat"`
	Lon    float64 `json:"lon"`
	Fee    int64   `json:"fee"`
	Delay  string  `json:"delay"`
	Active bool    `json:"active" gorm:"default:true"`
}
type ContactMessage struct {
	Base
	Name    string `json:"name"`
	Email   string `json:"email"`
	Phone   string `json:"phone"`
	Subject string `json:"subject"`
	Body    string `json:"body"`
	Status  string `json:"status"`
}

// Expense is a day-to-day operating cost of the shop (loyer, transport,
// électricité…). SpentOn is the business day the money left the till, which is
// not always the day the line was recorded.
type Expense struct {
	Base
	Reference     string    `json:"reference" gorm:"uniqueIndex"`
	SpentOn       time.Time `json:"spentOn" gorm:"index"`
	Category      string    `json:"category" gorm:"index"`
	Label         string    `json:"label"`
	Amount        int64     `json:"amount"`
	PaymentMethod string    `json:"paymentMethod"`
	SupplierID    *uint     `json:"supplierId"`
	UserID        uint      `json:"userId"`
	Note          string    `json:"note"`
	Supplier      *Supplier `json:"supplier,omitempty" gorm:"foreignKey:SupplierID"`
	User          *User     `json:"user,omitempty" gorm:"foreignKey:UserID"`
}
