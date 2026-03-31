import { useI18n } from "../../hooks/use_i18n";
import type { FileEntry } from "../../contexts/AppContext";

export function FileList({ files }: { files: FileEntry[] }): React.JSX.Element {
	const { t } = useI18n();
	return (
		<section
			className="file-list"
			aria-label={t("table.header.filename") || "File list"}
		>
			<ul className="file-list__items" role="list">
				{files.map((file) => (
					<li key={file.id} className="file-list__item">
						<span className="file-list__name">{file.name}</span>
						<span className="file-list__path">{file.path}</span>
					</li>
				))}
			</ul>
		</section>
	);
}
