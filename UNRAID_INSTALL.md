# SCADarina – unRAID Installation Guide

Complete guide for a clean unRAID integration

---

## 1. Copy Application Files to unRAID

Copy the entire contents of the `/scadarina` folder to `/mnt/user/appdata/scadarina/`

---

## 2. Preparation via unRAID Terminal (Single Command)

Run the following command in the unRAID terminal. It creates the data directories, stores the official unRAID template, and builds the Docker image:

```bash
mkdir -p /mnt/user/appdata/scadarina/models /mnt/user/appdata/scadarina/libraries && cat << 'EOF' > /boot/config/plugins/dockerMan/templates-user/my-SCADarina.xml
<?xml version="1.0"?>
<Container version="2">
  <Name>SCADarina</Name>
  <Repository>scadarina:latest</Repository>
  <Network>bridge</Network>
  <Category>Tools: Productivity:</Category>
  <WebUI>http://[IP]:[PORT:5343]</WebUI>
  <Icon>https://raw.githubusercontent.com/CameraRick/SCADarina/refs/heads/main/img/logo/png/scadarina_512.png</Icon>
  <ExtraParams>--restart unless-stopped</ExtraParams>
  <Config Name="WebUI Port" Target="5000" Default="5343" Mode="tcp" Description="" Type="Port" Display="always" Required="true" Mask="false">5343</Config>
  <Config Name="OpenSCAD Version" Target="OPENSCAD_VERSION" Default="stable" Mode="" Description="Choose 'nightly' (fast Manifold engine) or 'stable' (classic CGAL engine)" Type="Variable" Display="always" Required="false" Mask="false">stable</Config>
  <Config Name="models" Target="/app/models" Default="/mnt/user/appdata/scadarina/models" Mode="rw" Description="uploaded files, and files saved through the GUI" Type="Path" Display="always" Required="true" Mask="false">/mnt/user/appdata/scadarina/models</Config>
  <Config Name="libraries" Target="/root/.local/share/OpenSCAD/libraries" Default="/mnt/user/appdata/scadarina/libraries" Mode="rw" Description="external libraries and dependencies" Type="Path" Display="always" Required="true" Mask="false">/mnt/user/appdata/scadarina/libraries</Config>
</Container>
EOF
cd /mnt/user/appdata/scadarina && docker build -t scadarina .
```

---

## 3. Activate Container in unRAID

To ensure unRAID recognizes the container natively (with "Edit" and "WebUI" options enabled rather than as "3rd Party"):

1. Open the **Docker** tab in the unRAID web interface.
2. Scroll to the bottom and click **Add Container**.
3. In the **Template** dropdown at the top, select **SCADarina**.
4. All settings (Port 5343, paths for models & libraries) are pre-filled.
5. Click **Apply** at the bottom.

---

## 4. Done

---

## 5. Updating Changes and Testing

After making changes to the code or template:

1. Transfer the local `scadarina` folder to `/mnt/user/appdata/scadarina/`.
2. Rebuild the Docker image in the unRAID terminal:

```bash
cd /mnt/user/appdata/scadarina && docker build -t scadarina .
```

3. Update the container with the new image:
   - Either in the WebGUI: Go to **SCADarina** -> **Edit** and click **Apply** at the bottom (recreates the container with the new image).
   - Or in the terminal: `docker restart SCADarina` (if the container uses the local tag).
4. Reload the WebUI in your browser with `Ctrl + F5`.
