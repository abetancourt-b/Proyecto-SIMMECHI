from flask import Flask, render_template

app = Flask(__name__)

@app.route('/')
def datos():
    return render_template('datos.html')

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
# No mover nada de if __name__ = '__main__' para abajo, hace posible que lo abras en otro dispositivo