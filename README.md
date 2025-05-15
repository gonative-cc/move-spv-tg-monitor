# move-spv-tg-monitor

A simple monitoring script for a Bitcoin SPV Light Client running on the Sui network. It checks the client's `head_height` and reports to a specified Telegram channel if the height hasn't updated for a prolonged period of time, with escalating warnings (20min, 30min and 1hour).


## Setup

1.  Clone the Repository:
    ```bash
    git clone https://github.com/gonative-cc/move-spv-tg-monitor.git
    cd move-spv-tg-monitor
    ```

2.  Install Dependencies:
    ```bash
    npm install
    ```

3.  Create a Telegram Bot and Get Channel/Chat ID:**
    - To create a Bot follow https://core.telegram.org/bots#creating-a-new-bot. Save the `BOT_TOKEN`.
    - Get Channel ID:
        1.  Create a new Telegram Channel.
        2.  Add your newly created bot as an administrator to this channel with permission to "Post messages."
        3.  Obtain the Channel ID (eg. @LIGHT_CLIENT_ALERTS_BOT)

4.  Create and Configure `.env` File:
    Create a `.env` file in the root of the project (`move-spv-tg-monitor/.env`). Add the following content, replacing the placeholder values with your actual data:

    ```env
    # .env example
    BOT_TOKEN=YOUR_BOT_TOKEN
    CHAT_ID=@YOUR_CHAT_ID
    ```

## Running the Monitor

The script is intended to be run periodically (eg. every 5 minutes). you can use `cron` to do it.

Example:
```cron
*/5 * * * * /usr/local/bin/node /home/user/projects/move-spv-tg-monitor/light_client_health_check.js >> /home/user/projects/move-spv-tg-monitor/monitor_cron.log 2>&1
```
- `*/5 * * * *`: Runs the command every 5 minutes.
- The command runs your compiled JavaScript file using `node`.
- `>> ... monitor_cron.log 2>&1`: Appends all output from the script to `monitor_cron.log` in project root dir.