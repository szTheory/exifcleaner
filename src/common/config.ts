const Store = require("electron-store");

export const store = new Store({
	defaults: {
		favoriteAnimal: "🦄"
	}
});
