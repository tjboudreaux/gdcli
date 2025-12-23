import { google, type slides_v1 } from "googleapis";
import type { Presentation, Slide, Thumbnail } from "../types.js";
import { BaseService } from "./base-service.js";

export interface SlideLayoutType {
	BLANK: "BLANK";
	CAPTION_ONLY: "CAPTION_ONLY";
	TITLE: "TITLE";
	TITLE_AND_BODY: "TITLE_AND_BODY";
	TITLE_AND_TWO_COLUMNS: "TITLE_AND_TWO_COLUMNS";
	TITLE_ONLY: "TITLE_ONLY";
	SECTION_HEADER: "SECTION_HEADER";
	SECTION_TITLE_AND_DESCRIPTION: "SECTION_TITLE_AND_DESCRIPTION";
	ONE_COLUMN_TEXT: "ONE_COLUMN_TEXT";
	MAIN_POINT: "MAIN_POINT";
	BIG_NUMBER: "BIG_NUMBER";
}

export interface AddSlideOptions {
	layout?: keyof SlideLayoutType;
	insertionIndex?: number;
	objectId?: string;
}

export interface AddTextOptions {
	pageObjectId: string;
	text: string;
	x?: number;
	y?: number;
	width?: number;
	height?: number;
}

export interface ReplaceTextOptions {
	find: string;
	replace: string;
	matchCase?: boolean;
}

export class SlidesService extends BaseService {
	private slidesClients: Map<string, slides_v1.Slides> = new Map();

	private getSlidesClient(email: string): slides_v1.Slides {
		if (!this.slidesClients.has(email)) {
			const auth = this.getOAuth2Client(email);
			const slides = google.slides({ version: "v1", auth });
			this.slidesClients.set(email, slides);
		}
		return this.slidesClients.get(email)!;
	}

	async create(email: string, title: string): Promise<Presentation> {
		const slides = this.getSlidesClient(email);

		const response = await slides.presentations.create({
			requestBody: { title },
		});

		return this.mapPresentation(response.data);
	}

	async get(email: string, presentationId: string): Promise<Presentation> {
		const slides = this.getSlidesClient(email);

		const response = await slides.presentations.get({
			presentationId,
		});

		return this.mapPresentation(response.data);
	}

	async getPage(email: string, presentationId: string, pageObjectId: string): Promise<Slide> {
		const slides = this.getSlidesClient(email);

		const response = await slides.presentations.pages.get({
			presentationId,
			pageObjectId,
		});

		return this.mapSlide(response.data);
	}

	async getThumbnail(
		email: string,
		presentationId: string,
		pageObjectId: string,
		mimeType: "PNG" | "JPEG" = "PNG",
	): Promise<Thumbnail> {
		const slides = this.getSlidesClient(email);

		const response = await slides.presentations.pages.getThumbnail({
			presentationId,
			pageObjectId,
			"thumbnailProperties.mimeType": `image/${mimeType.toLowerCase()}`,
		});

		return {
			contentUrl: response.data.contentUrl ?? "",
			width: response.data.width ?? undefined,
			height: response.data.height ?? undefined,
		};
	}

	async addSlide(email: string, presentationId: string, options: AddSlideOptions = {}): Promise<string> {
		const slides = this.getSlidesClient(email);

		const objectId = options.objectId ?? `slide_${Date.now()}`;

		const request: slides_v1.Schema$Request = {
			createSlide: {
				objectId,
				insertionIndex: options.insertionIndex,
				slideLayoutReference: options.layout ? { predefinedLayout: options.layout } : undefined,
			},
		};

		await slides.presentations.batchUpdate({
			presentationId,
			requestBody: {
				requests: [request],
			},
		});

		return objectId;
	}

	async deleteSlide(email: string, presentationId: string, pageObjectId: string): Promise<void> {
		const slides = this.getSlidesClient(email);

		await slides.presentations.batchUpdate({
			presentationId,
			requestBody: {
				requests: [
					{
						deleteObject: { objectId: pageObjectId },
					},
				],
			},
		});
	}

	async replaceAllText(email: string, presentationId: string, options: ReplaceTextOptions): Promise<number> {
		const slides = this.getSlidesClient(email);

		const response = await slides.presentations.batchUpdate({
			presentationId,
			requestBody: {
				requests: [
					{
						replaceAllText: {
							containsText: {
								text: options.find,
								matchCase: options.matchCase ?? true,
							},
							replaceText: options.replace,
						},
					},
				],
			},
		});

		const reply = response.data.replies?.[0]?.replaceAllText;
		return reply?.occurrencesChanged ?? 0;
	}

	async addTextBox(email: string, presentationId: string, options: AddTextOptions): Promise<string> {
		const slides = this.getSlidesClient(email);

		const textBoxId = `textbox_${Date.now()}`;

		const requests: slides_v1.Schema$Request[] = [
			{
				createShape: {
					objectId: textBoxId,
					shapeType: "TEXT_BOX",
					elementProperties: {
						pageObjectId: options.pageObjectId,
						size: {
							width: { magnitude: options.width ?? 300, unit: "PT" },
							height: { magnitude: options.height ?? 50, unit: "PT" },
						},
						transform: {
							scaleX: 1,
							scaleY: 1,
							translateX: options.x ?? 100,
							translateY: options.y ?? 100,
							unit: "PT",
						},
					},
				},
			},
			{
				insertText: {
					objectId: textBoxId,
					text: options.text,
					insertionIndex: 0,
				},
			},
		];

		await slides.presentations.batchUpdate({
			presentationId,
			requestBody: { requests },
		});

		return textBoxId;
	}

	async duplicateSlide(email: string, presentationId: string, pageObjectId: string): Promise<string> {
		const slides = this.getSlidesClient(email);

		const newObjectId = `slide_copy_${Date.now()}`;

		await slides.presentations.batchUpdate({
			presentationId,
			requestBody: {
				requests: [
					{
						duplicateObject: {
							objectId: pageObjectId,
							objectIds: { [pageObjectId]: newObjectId },
						},
					},
				],
			},
		});

		return newObjectId;
	}

	async batchUpdate(
		email: string,
		presentationId: string,
		requests: slides_v1.Schema$Request[],
	): Promise<slides_v1.Schema$BatchUpdatePresentationResponse> {
		const slides = this.getSlidesClient(email);

		const response = await slides.presentations.batchUpdate({
			presentationId,
			requestBody: { requests },
		});

		return response.data;
	}

	extractText(presentation: Presentation): string {
		if (!presentation.slides) {
			return "";
		}

		const textParts: string[] = [];

		for (const slide of presentation.slides) {
			if (slide.pageElements) {
				for (const element of slide.pageElements) {
					if (element.shape?.text?.textElements) {
						for (const textElement of element.shape.text.textElements) {
							if (textElement.textRun?.content) {
								textParts.push(textElement.textRun.content);
							}
						}
					}
				}
			}
		}

		return textParts.join("");
	}

	getSlideIds(presentation: Presentation): string[] {
		return presentation.slides?.map((s) => s.objectId) ?? [];
	}

	private mapPresentation(data: slides_v1.Schema$Presentation): Presentation {
		return {
			presentationId: data.presentationId ?? "",
			title: data.title ?? undefined,
			slides: data.slides?.map(this.mapSlide) ?? [],
			pageSize: data.pageSize
				? {
						width: data.pageSize.width
							? { magnitude: data.pageSize.width.magnitude ?? undefined, unit: data.pageSize.width.unit ?? undefined }
							: undefined,
						height: data.pageSize.height
							? { magnitude: data.pageSize.height.magnitude ?? undefined, unit: data.pageSize.height.unit ?? undefined }
							: undefined,
					}
				: undefined,
		};
	}

	private mapSlide(page: slides_v1.Schema$Page): Slide {
		return {
			objectId: page.objectId ?? "",
			pageElements: page.pageElements?.map((pe) => ({
				objectId: pe.objectId ?? undefined,
				size: pe.size
					? {
							width: pe.size.width
								? { magnitude: pe.size.width.magnitude ?? undefined, unit: pe.size.width.unit ?? undefined }
								: undefined,
							height: pe.size.height
								? { magnitude: pe.size.height.magnitude ?? undefined, unit: pe.size.height.unit ?? undefined }
								: undefined,
						}
					: undefined,
				transform: pe.transform
					? {
							scaleX: pe.transform.scaleX ?? undefined,
							scaleY: pe.transform.scaleY ?? undefined,
							translateX: pe.transform.translateX ?? undefined,
							translateY: pe.transform.translateY ?? undefined,
							unit: pe.transform.unit ?? undefined,
						}
					: undefined,
				shape: pe.shape
					? {
							shapeType: pe.shape.shapeType ?? undefined,
							text: pe.shape.text
								? {
										textElements: pe.shape.text.textElements?.map((te) => ({
											startIndex: te.startIndex ?? undefined,
											endIndex: te.endIndex ?? undefined,
											textRun: te.textRun
												? { content: te.textRun.content ?? undefined, style: te.textRun.style }
												: undefined,
											paragraphMarker: te.paragraphMarker ?? undefined,
										})),
									}
								: undefined,
						}
					: undefined,
				image: pe.image
					? {
							contentUrl: pe.image.contentUrl ?? undefined,
							sourceUrl: pe.image.sourceUrl ?? undefined,
						}
					: undefined,
				table: pe.table
					? {
							rows: pe.table.rows ?? undefined,
							columns: pe.table.columns ?? undefined,
						}
					: undefined,
			})),
		};
	}

	generateWebUrl(presentationId: string, slideIndex?: number): string {
		let url = `https://docs.google.com/presentation/d/${presentationId}/edit`;
		if (slideIndex !== undefined) {
			url += `#slide=id.p${slideIndex + 1}`;
		}
		return url;
	}

	clearSlidesClientCache(email?: string): void {
		if (email) {
			this.slidesClients.delete(email);
		} else {
			this.slidesClients.clear();
		}
		this.clearClientCache(email);
	}
}
