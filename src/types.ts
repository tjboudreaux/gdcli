export interface OAuth2Credentials {
	clientId: string;
	clientSecret: string;
	refreshToken: string;
	accessToken?: string;
}

export interface Account {
	email: string;
	oauth2: OAuth2Credentials;
}

export interface StoredCredentials {
	clientId: string;
	clientSecret: string;
}

export interface DriveFile {
	id: string;
	name: string;
	mimeType: string;
	size?: string;
	modifiedTime?: string;
	createdTime?: string;
	parents?: string[];
	webViewLink?: string;
	owners?: Array<{ emailAddress: string; displayName?: string }>;
}

export interface DriveListResult {
	files: DriveFile[];
	nextPageToken?: string;
}

export interface Permission {
	id: string;
	type: string;
	role: string;
	emailAddress?: string;
	displayName?: string;
}

export interface DocsDocument {
	documentId: string;
	title: string;
	body?: DocsBody;
	revisionId?: string;
}

export interface DocsBody {
	content?: DocsStructuralElement[];
}

export interface DocsStructuralElement {
	startIndex?: number;
	endIndex?: number;
	paragraph?: DocsParagraph;
	table?: DocsTable;
	sectionBreak?: object;
}

export interface DocsParagraph {
	elements?: DocsParagraphElement[];
	paragraphStyle?: DocsParagraphStyle;
	bullet?: DocsBullet;
}

export interface DocsParagraphElement {
	startIndex?: number;
	endIndex?: number;
	textRun?: DocsTextRun;
}

export interface DocsTextRun {
	content?: string;
	textStyle?: DocsTextStyle;
}

export interface DocsTextStyle {
	bold?: boolean;
	italic?: boolean;
	underline?: boolean;
	strikethrough?: boolean;
	link?: { url?: string };
}

export interface DocsParagraphStyle {
	namedStyleType?: string;
	headingId?: string;
}

export interface DocsBullet {
	listId?: string;
	nestingLevel?: number;
}

export interface DocsTable {
	rows?: number;
	columns?: number;
	tableRows?: DocsTableRow[];
}

export interface DocsTableRow {
	tableCells?: DocsTableCell[];
}

export interface DocsTableCell {
	content?: DocsStructuralElement[];
}

export interface Spreadsheet {
	spreadsheetId: string;
	properties?: SpreadsheetProperties;
	sheets?: Sheet[];
}

export interface SpreadsheetProperties {
	title?: string;
	locale?: string;
	timeZone?: string;
}

export interface Sheet {
	properties?: SheetProperties;
}

export interface SheetProperties {
	sheetId?: number;
	title?: string;
	index?: number;
}

export interface CellValue {
	stringValue?: string;
	numberValue?: number;
	boolValue?: boolean;
	formulaValue?: string;
}

export interface ValueRange {
	range: string;
	majorDimension?: "ROWS" | "COLUMNS";
	values?: unknown[][];
}

export interface Presentation {
	presentationId: string;
	title?: string;
	slides?: Slide[];
	pageSize?: { width?: Dimension; height?: Dimension };
}

export interface Slide {
	objectId: string;
	pageElements?: PageElement[];
}

export interface PageElement {
	objectId?: string;
	size?: { width?: Dimension; height?: Dimension };
	transform?: AffineTransform;
	shape?: Shape;
	image?: Image;
	table?: SlidesTable;
}

export interface Dimension {
	magnitude?: number;
	unit?: string;
}

export interface AffineTransform {
	scaleX?: number;
	scaleY?: number;
	translateX?: number;
	translateY?: number;
	unit?: string;
}

export interface Shape {
	shapeType?: string;
	text?: TextContent;
}

export interface TextContent {
	textElements?: TextElement[];
}

export interface TextElement {
	startIndex?: number;
	endIndex?: number;
	textRun?: { content?: string; style?: object };
	paragraphMarker?: object;
}

export interface Image {
	contentUrl?: string;
	sourceUrl?: string;
}

export interface SlidesTable {
	rows?: number;
	columns?: number;
}

export interface Thumbnail {
	contentUrl: string;
	width?: number;
	height?: number;
}

export type OutputFormat = "text" | "json" | "tsv";

export interface CliOptions {
	format?: OutputFormat;
	max?: number;
	page?: string;
}
