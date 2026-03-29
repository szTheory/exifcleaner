import type { XattrCommand } from "../../src/application/xattr_command";

export class FakeXattrCommand implements Pick<XattrCommand, "execute"> {
	calls: { filePath: string }[] = [];

	async execute({ filePath }: { filePath: string }): Promise<void> {
		this.calls.push({ filePath });
	}
}
