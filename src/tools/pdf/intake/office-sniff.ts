/**
 * Office documents are archives: OOXML (docx, xlsx, pptx) is a ZIP and the 97–2003
 * formats (doc, xls, ppt) are OLE2 compound files. The archive signature alone says
 * nothing about the format, so these readers list the entry names, reading only the
 * directory of the archive and never its contents.
 */

import type { OfficeFormat } from "../contract/kinds.ts";

/** Reads bytes `[start, end)` of a file; `end` past the size is clamped by the reader. */
export type ByteReader = (start: number, end: number) => Promise<Uint8Array>;

const terminator = 0xff_ff_ff_fa; // CFB: free, end-of-chain and reserved ids start here.
const maxZipDirectory = 4 * 1024 * 1024;
const maxCfbSectors = 1024;
const zipEndRecord = 22;
const zipCommentMax = 0xff_ff;

function view(bytes: Uint8Array): DataView {
	return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

const ooxmlFormats = ["docx", "xlsx", "pptx"] as const;

function ooxmlFromName(fileName: string): OfficeFormat | undefined {
	const extension = fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase();

	return ooxmlFormats.find((format) => format === extension);
}

/** OOXML packages carry [Content_Types].xml and one main folder. ODF, EPUB and plain ZIPs do not. */
export function ooxmlFromEntries(names: ReadonlyArray<string>): OfficeFormat | undefined {
	if (!names.includes("[Content_Types].xml")) return undefined;

	if (names.some((name) => name.startsWith("word/"))) return "docx";

	if (names.some((name) => name.startsWith("xl/"))) return "xlsx";

	if (names.some((name) => name.startsWith("ppt/"))) return "pptx";

	return undefined;
}

/** Entry names from the ZIP central directory, or undefined when it cannot be located. */
export async function zipEntryNames(
	read: ByteReader,
	size: number,
): Promise<ReadonlyArray<string> | undefined> {
	const tailStart = Math.max(0, size - zipEndRecord - zipCommentMax);
	const tail = await read(tailStart, size);
	const tailView = view(tail);
	let end = -1;

	for (let offset = tail.length - zipEndRecord; offset >= 0; offset -= 1) {
		if (tailView.getUint32(offset, true) === 0x06_05_4b_50) {
			end = offset;
			break;
		}
	}

	if (end === -1) return undefined;

	const directorySize = tailView.getUint32(end + 12, true);
	const directoryOffset = tailView.getUint32(end + 16, true);

	// ZIP64 marks these fields with 0xFFFFFFFF; Office never needs it under our 50 MiB limit.
	if (directorySize > maxZipDirectory || directoryOffset + directorySize > size) return undefined;

	const directory = await read(directoryOffset, directoryOffset + directorySize);
	const entries = view(directory);
	const decoder = new TextDecoder();
	const names: Array<string> = [];
	let offset = 0;

	while (offset + 46 <= directory.length && entries.getUint32(offset, true) === 0x02_01_4b_50) {
		const nameLength = entries.getUint16(offset + 28, true);
		const extraLength = entries.getUint16(offset + 30, true);
		const commentLength = entries.getUint16(offset + 32, true);

		names.push(decoder.decode(directory.subarray(offset + 46, offset + 46 + nameLength)));
		offset += 46 + nameLength + extraLength + commentLength;
	}

	return names;
}

const cfbStreams: ReadonlyMap<string, OfficeFormat | "encrypted"> = new Map([
	["WordDocument", "doc"],
	["Workbook", "xls"],
	["PowerPoint Document", "ppt"],
	// An encrypted docx, xlsx or pptx is a compound file around the real package.
	["EncryptedPackage", "encrypted"],
]);

/** Stream names from the directory of an OLE2 compound file (MS-CFB §2.6). */
export async function cfbEntryNames(read: ByteReader): Promise<ReadonlyArray<string>> {
	const headerBytes = await read(0, 512);

	if (headerBytes.length < 512) return [];

	const header = view(headerBytes);
	const sectorSize = 2 ** header.getUint16(0x1e, true);

	if (sectorSize !== 512 && sectorSize !== 4096) return [];

	const perSector = sectorSize / 4;

	const fatSectors = Array.from({ length: 109 }, (_, index) =>
		header.getUint32(0x4c + index * 4, true),
	);

	let difat = header.getUint32(0x44, true);
	let difatRead = 0;

	const sectorAt = (id: number): Promise<Uint8Array> =>
		read((id + 1) * sectorSize, (id + 2) * sectorSize);

	const fatSector = async (index: number): Promise<number | undefined> => {
		// Files over ~7 MB list further FAT sectors in a chain of DIFAT sectors.
		while (index >= fatSectors.length && difat < terminator && difatRead < maxCfbSectors) {
			difatRead += 1;
			const bytes = await sectorAt(difat);

			if (bytes.length < sectorSize) break;

			const sector = view(bytes);

			for (let slot = 0; slot < perSector - 1; slot += 1) {
				fatSectors.push(sector.getUint32(slot * 4, true));
			}

			difat = sector.getUint32((perSector - 1) * 4, true);
		}

		return fatSectors[index];
	};

	const next = async (id: number): Promise<number> => {
		const fat = await fatSector(Math.floor(id / perSector));

		if (fat === undefined || fat >= terminator) return terminator;

		const bytes = await sectorAt(fat);

		// A truncated file ends the chain instead of reading past its last byte.
		return bytes.length < sectorSize
			? terminator
			: view(bytes).getUint32((id % perSector) * 4, true);
	};

	const names: Array<string> = [];
	const visited = new Set<number>();
	let sector = header.getUint32(0x30, true);

	while (sector < terminator && !visited.has(sector) && visited.size < maxCfbSectors) {
		visited.add(sector);
		const entries = await sectorAt(sector);
		const entryView = view(entries);

		for (let offset = 0; offset + 128 <= entries.length; offset += 128) {
			const nameBytes = Math.min(entryView.getUint16(offset + 0x40, true), 64);
			const isStream = entries[offset + 0x42] === 2;

			if (isStream && nameBytes > 2) {
				const name = new TextDecoder("utf-16le").decode(
					entries.subarray(offset, offset + nameBytes - 2),
				);

				names.push(name);
			}
		}

		sector = await next(sector);
	}

	return names;
}

/** The legacy format from the stream names; an encrypted package takes the OOXML type from its name. */
export function cfbFormat(
	names: ReadonlyArray<string>,
	fileName: string,
): OfficeFormat | undefined {
	for (const name of names) {
		const format = cfbStreams.get(name);

		if (format === "encrypted") return ooxmlFromName(fileName);

		if (format !== undefined) return format;
	}

	return undefined;
}
