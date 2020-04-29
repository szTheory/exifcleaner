import Store from "electron-store";

function defaultStore(): Store {
	return new Store({
		defaults: {
			favoriteAnimal: "🦄"
		}
	});
}

export const configStore = defaultStore();
