# narn Bot, Version 2
New and Improved Narn Bot for the CIC Discord.

## Expected Environment Variables
- BOT_TOKEN - should be equal to Discord API bot Token from Discord.com developer dashboard
- EPIC_GAMES_URL - endpoint for the Epic Games free games promotion API, should be equal to https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions at the time of writing.
- SAVED_DEALS - filename to store cached deals into, I use `saved_deals.json`
- ERROR_LOG - filename to write errors to, e.g. `error.log`

## Other configuration
Currently the bot is hard coded to use the CIC Discord channel #wingnut.

To customize for a different channel, the channel assignment in Discord "once" closure needs to be adjusted in `main.ts`. Be sure that the bot has been authorized for the server and channel.