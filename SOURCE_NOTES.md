# Source basis

This package was built only from the two ZIP files uploaded in this conversation:

- `server-master.zip`
- `web-master.zip`

Observed architecture in those sources:

- PHP frontend/API
- Node.js WebSocket server on port 4444
- MySQL/MariaDB persistence
- Varo Auth calls for ADDDOMAIN / VERIFYDOMAIN
- HNSChat-created SLD path via ADDSLD
- TLD-bound channel filtering in the Node server
- internal mini-profile fields including avatar and bio
- optional Janus/video, Expo push and link-preview functionality

No original SQL schema was present in the uploaded ZIPs. `database.sql` is reconstructed from code usage and therefore must be validated by running the application.
