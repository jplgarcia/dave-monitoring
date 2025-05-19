export async function notifyDiscord(message) {
    const webhookUrl = process.env.DISCORD_WEBHOOK;
    if (!webhookUrl) {
        console.warn('No DISCORD_WEBHOOK set in environment variables.');
        return;
    }

    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: message }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Discord webhook error: ${errorText}`);
        }

        console.log('Notification sent to Discord.');
    } catch (err) {
        console.error('Failed to send Discord notification:', err);
        process.exit(1)
    }
}