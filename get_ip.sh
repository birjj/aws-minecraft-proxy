
IP_ADDR=$(aws --region us-east-1 \
ec2 describe-instances \
--filters \
"Name=instance-state-name,Values=running" \
"Name=instance-id,Values=<Minecraft-Server-Instance-ID>" \
--query 'Reservations[*].Instances[*].[PublicIpAddress]' \
--output text)

echo "$IP_ADDR"


