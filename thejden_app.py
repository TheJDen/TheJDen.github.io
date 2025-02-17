import marimo

__generated_with = "0.11.5"
app = marimo.App(width="medium")


@app.cell
def _():
    import marimo as mo
    return (mo,)


@app.cell
def _(mo):
    mo.md("""# Welcome to TheJDen!""")
    return


@app.cell
def _(mo):
    mo.md(
        """
        ## This is my demo page

        Let's see how my page looks when I include this passage
        """
    )
    return


@app.cell
def _(mo):
    repetitions = mo.ui.slider(1, 16, label=f"Slide for 🍦: ")
    repetitions
    return (repetitions,)


@app.cell
def _(mo, repetitions):
    mo.md("# " + "🍦" * repetitions.value)
    return


if __name__ == "__main__":
    app.run()
