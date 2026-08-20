import type { RemoveXattrCommand } from "../../src/application/commands/remove_xattr_command";

export class FakeRemoveXattrCommand implements Pick<
	RemoveXattrCommand,
	"execute"
> {
	calls: { filePath: string }[] = [];

	async execute({ filePath }: { filePath: string }): Promise<void> {
		this.calls.push({ filePath });
	}
}
