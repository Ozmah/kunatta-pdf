import type { ReceiveFiles } from "../shared/files.ts";
import { connectDropzone, type DropzoneControl } from "./dropzone.ts";

/** <kn-dropzone>: the empty drop zone, the file picker, pasting and the notice. Dropzone.astro holds its markup and defines it. */
export class DropzoneElement extends HTMLElement {
	connect(receive: ReceiveFiles): DropzoneControl {
		return connectDropzone(this, receive);
	}
}

declare global {
	interface HTMLElementTagNameMap {
		"kn-dropzone": DropzoneElement;
	}
}
