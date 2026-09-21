import os
import subprocess
import uuid
import json
from flask import Flask, request, jsonify, send_file, render_template, send_from_directory

app = Flask(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
MODELS_DIR = os.path.join(BASE_DIR, "models")
UPLOAD_DIR = "/tmp/scad_work"

os.makedirs(MODELS_DIR, exist_ok=True)
os.makedirs(UPLOAD_DIR, exist_ok=True)

@app.route('/')
def index():
    return send_from_directory(STATIC_DIR, 'index.html')

@app.route('/favicon.ico')
def favicon():
    return send_from_directory(
        STATIC_DIR,
        'favicon.ico',
        mimetype='image/x-icon',
        max_age=0
    )

@app.route('/svg/<path:filename>')
def serve_svg(filename):
    return send_from_directory(
        os.path.join(STATIC_DIR, 'svg'),
        filename,
        mimetype='image/svg+xml'
    )

def get_safe_path(rel_path):
    rel_path = rel_path.strip().lstrip('/\\')
    full_path = os.path.abspath(os.path.join(MODELS_DIR, rel_path))
    if not full_path.startswith(os.path.abspath(MODELS_DIR)):
        raise ValueError("Invalid path")
    return full_path

@app.route('/api/models', methods=['GET'])
def list_models():
    folder = request.args.get('path', '').strip()
    try:
        target_dir = get_safe_path(folder)
        if not os.path.exists(target_dir):
            return jsonify({'current': folder, 'folders': [], 'files': []})
        
        folders = []
        files = []
        for entry in os.scandir(target_dir):
            if entry.name.startswith('.'):
                continue
            if entry.is_dir():
                folders.append(entry.name)
            elif entry.is_file() and entry.name.lower().endswith(('.scad', '.csg', '.stl', '.obj', '.3mf')):
                files.append(entry.name)
        
        folders.sort(key=str.lower)
        files.sort(key=str.lower)
        return jsonify({'current': folder.replace('\\', '/'), 'folders': folders, 'files': files})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/models/file', methods=['GET'])
def load_model_file():
    filepath = request.args.get('path', '').strip()
    try:
        path = get_safe_path(filepath)
        if not os.path.exists(path) or os.path.isdir(path):
            return jsonify({'error': 'File not found'}), 404
        
        lower = path.lower()
        if lower.endswith('.stl'):
            return send_file(path, mimetype='application/sla', as_attachment=False)
        elif lower.endswith('.obj'):
            return send_file(path, mimetype='text/plain', as_attachment=False)
        elif lower.endswith('.3mf'):
            return send_file(path, mimetype='application/vnd.ms-package.3dmanufacturing-3dmodel+xml', as_attachment=False)
        
        with open(path, 'r', encoding='utf-8') as f:
            return jsonify({'filename': os.path.basename(path), 'path': filepath, 'content': f.read()})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/models/download', methods=['GET'])
def download_model_file():
    filepath = request.args.get('path', '').strip()
    try:
        path = get_safe_path(filepath)
        if not os.path.exists(path) or os.path.isdir(path):
            return jsonify({'error': 'File not found'}), 404
        return send_file(path, as_attachment=True, download_name=os.path.basename(path))
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/models/upload', methods=['POST'])
def upload_to_folder():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400
    file = request.files['file']
    folder = request.form.get('path', '').strip()
    filename = request.form.get('filename', file.filename).strip()
    if not filename:
        return jsonify({'error': 'No filename provided'}), 400

    try:
        target_dir = get_safe_path(folder)
        os.makedirs(target_dir, exist_ok=True)
        dest_path = os.path.join(target_dir, os.path.basename(filename))
        file.save(dest_path)
        return jsonify({'success': True, 'filename': os.path.basename(filename)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/models/folder', methods=['POST'])
def create_model_folder():
    data = request.get_json() or {}
    folder = data.get('path', '').strip()
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'error': 'Folder name required'}), 400
    try:
        parent_dir = get_safe_path(folder)
        new_dir = os.path.join(parent_dir, os.path.basename(name))
        os.makedirs(new_dir, exist_ok=True)
        return jsonify({'success': True, 'name': os.path.basename(name)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/models/rename', methods=['POST'])
def rename_model_item():
    data = request.get_json() or {}
    old_rel = data.get('oldPath', '').strip()
    new_name = data.get('newName', '').strip()
    if not old_rel or not new_name:
        return jsonify({'error': 'Path and new name required'}), 400
    try:
        old_path = get_safe_path(old_rel)
        if not os.path.exists(old_path):
            return jsonify({'error': 'Item not found'}), 404
        parent_dir = os.path.dirname(old_path)
        new_path = os.path.join(parent_dir, os.path.basename(new_name))
        os.rename(old_path, new_path)
        return jsonify({'success': True, 'newName': os.path.basename(new_name)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/models/item', methods=['DELETE'])
def delete_model_item():
    rel_path = request.args.get('path', '').strip()
    if not rel_path:
        return jsonify({'error': 'Path required'}), 400
    try:
        target_path = get_safe_path(rel_path)
        if not os.path.exists(target_path):
            return jsonify({'error': 'Item not found'}), 404
        if os.path.isdir(target_path):
            import shutil
            shutil.rmtree(target_path)
        else:
            os.remove(target_path)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/models/export', methods=['POST'])
def save_exported_stl():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400
    file = request.files['file']
    filename = request.form.get('filename', file.filename).strip()
    if not filename:
        return jsonify({'error': 'No filename provided'}), 400
    if not filename.lower().endswith('.stl'):
        filename += '.stl'

    export_dir = os.path.join(MODELS_DIR, '_export')
    os.makedirs(export_dir, exist_ok=True)
    safe_name = os.path.basename(filename)
    dest_path = os.path.join(export_dir, safe_name)

    try:
        file.save(dest_path)
        return jsonify({'success': True, 'filename': safe_name})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/render', methods=['POST'])
def render_scad():
    data = request.get_json() or {}
    code = data.get('code', '')
    params = data.get('params', {})
    is_preview = data.get('preview', False)

    if not code:
        return jsonify({'error': 'No code provided'}), 400

    task_id = str(uuid.uuid4())
    scad_path = os.path.join(UPLOAD_DIR, f"{task_id}.scad")
    stl_path = os.path.join(UPLOAD_DIR, f"{task_id}.stl")

    with open(scad_path, "w", encoding="utf-8") as f:
        f.write(code)

    cmd = ["openscad", scad_path, "-o", stl_path]

    for k, v in params.items():
        if isinstance(v, bool):
            val_str = "true" if v else "false"
        elif isinstance(v, (int, float)):
            val_str = str(v)
        elif isinstance(v, str):
            val_str = f'"{v}"'
        else:
            val_str = json.dumps(v)
        cmd.extend(["-D", f"{k}={val_str}"])

    if is_preview:
        cmd.extend([
            "-D", "$fs=4.0",
            "-D", "$fa=20.0",
            "-D", "$fn=12"
        ])
        cmd.extend(["--preview"])

    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

    if os.path.exists(scad_path):
        os.remove(scad_path)

    if result.returncode != 0:
        return jsonify({'error': result.stderr or 'OpenSCAD error'}), 500

    return send_file(stl_path, mimetype='application/sla', as_attachment=False)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
