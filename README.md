Proxy Minecraft server that automatically runs a start command when someone pings it (i.e. displays it in the server list), and a shutdown command if nobody has been on a specified target server for 5 minutes.

Useful for starting or stopping an EC2 instance containing your Minecraft server when needed, and shutting it down to save money when it's not.

## Installation

First make sure you have an EC2 instance with your Minecraft server, and another server (e.g. an EC2 t3a.nano) that you want to use as the proxy. The proxy server should have the rights to manage the Minecraft server.

Clone this repo onto the proxy server and run `install.sh`. This will install dependencies and start running the proxy. Update `package.json` so that the `minecraft-aws` field has the configuration you want to use. The `target` is the IP and port of your Minecraft server, while the `commands` are commands to run when it should start/shutdown.  
As an example, I use this configuration:

```
{
    "minecraft-aws": {
        "target": {
            "host": "123.45.67.890",
            "port": 25565
        },
        "commands": {
            "start": "aws ec2 start-instances --instance-ids i-0...",
            "shutdown": "aws ec2 stop-instances --instance-ids i-0..."
        }
    }
}
```

Finally run `sudo systemctl restart minecraft-proxy` to reload the proxy server so it uses the new config.

## Usage

Simply add the proxy server's IP (and port 25565) to your Minecraft server list. Whenever you (or anyone else) pings the server for its current status, they _real_ Minecraft server will start. Once that one has finished starting up, the proxy server will directly pipe through all connections, making it completely invisible. Once nobody has been on the server for 5 minutes, the proxy server will shut down the Minecraft server and the process will start over again.
