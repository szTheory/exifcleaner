// Sanitize HTMl to prevent XSS and Electron remote shell attacks
export function sanitizeHTML(text: string): string {
	const element = document.createElement("div");
	element.innerText = text;

	return element.innerHTML;
}
