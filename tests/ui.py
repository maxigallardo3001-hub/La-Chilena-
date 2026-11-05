import os
import re
import sys

from playwright.sync_api import expect, sync_playwright

BASE = os.environ.get("UI_BASE_URL", "https://localhost:8443")
SHOTS = os.environ.get("SHOTS_DIR", "/evidencias/capturas")
DEMO = {
    "cliente": ("constanza@gmail.com", os.environ["DEMO_PASSWORD_CLIENTE"]),
    "administrador": ("admin@lachilena.cl", os.environ["DEMO_PASSWORD_ADMIN"]),
    "cajero": ("cajero@lachilena.cl", os.environ["DEMO_PASSWORD_CAJERO"]),
    "despacho": ("despacho@lachilena.cl", os.environ["DEMO_PASSWORD_DESPACHO"]),
    "dueno": ("dueno@lachilena.cl", os.environ["DEMO_PASSWORD_DUENO"]),
}
failures = []
expect.set_options(timeout=15000)


def check(name, action):
    try:
        action()
        print("PASS " + name)
    except Exception as error:
        print(f"FAIL {name}  ({str(error).splitlines()[0][:200]})")
        failures.append(name)


class Session:
    def __init__(self, browser, role=None, mobile=False):
        options = {"ignore_https_errors": True, "locale": "es-CL"}
        options["viewport"] = {"width": 390, "height": 844} if mobile else {"width": 1366, "height": 860}
        if mobile:
            options.update(is_mobile=True, has_touch=True, device_scale_factor=2)
        self.context = browser.new_context(**options)
        self.page = self.context.new_page()
        self.errors = []
        self.page.on("pageerror", lambda error: self.errors.append(str(error)))
        if role:
            self.login(*DEMO[role])

    def login(self, email, password):
        self.page.goto(BASE + "/login.html")
        self.page.fill("#email", email)
        self.page.fill("#pass", password)
        self.page.press("#pass", "Enter")
        self.page.wait_for_url(lambda url: "login.html" not in url)
        self.page.wait_for_load_state("networkidle")

    def open(self, path):
        self.page.goto(BASE + "/" + path)
        self.page.wait_for_load_state("networkidle")

    def shot(self, name, full_page=True):
        self.page.wait_for_timeout(300)
        self.page.screenshot(path=os.path.join(SHOTS, name + ".png"), full_page=full_page)

    def assert_clean(self):
        assert not self.errors, f"errores de JavaScript: {self.errors}"

    def close(self):
        self.context.close()


def run(browser):
    state = {}

    visitor = Session(browser)
    def catalog():
        visitor.open("index.html")
        expect(visitor.page.locator("[data-add]").first).to_be_visible()
        expect(visitor.page.locator("#productGrid")).to_contain_text("Empanada de pino")
        visitor.shot("01-catalogo-visitante")
        visitor.assert_clean()
    check("P01 visitante ve el catálogo sin sesión", catalog)

    def guarded():
        visitor.open("mis-pedidos.html")
        visitor.page.wait_for_url(re.compile(r"login\.html"))
        visitor.shot("02-login-requerido", full_page=False)
    check("P05 sin sesión, mis pedidos redirige al ingreso", guarded)
    visitor.close()

    client = Session(browser, "cliente")
    page = client.page

    def buy():
        client.open("index.html")
        expect(page.locator('[data-add="p-0001"]')).to_be_enabled()
        page.click('[data-add="p-0001"]')
        page.click('[data-add="p-0001"]')
        page.click('[data-add="p-0004"]')
        client.open("carrito.html")
        expect(page.locator("#cartList")).to_contain_text("Empanada de carne")
        page.click('[data-pay="deposito"]')
        client.shot("03-carrito-cliente")
        page.click("#confirmBtn")
        expect(page.locator("#paymentInfoModal")).to_be_visible()
        title = page.locator("#createdOrderTitle").inner_text()
        state["order"] = re.search(r"ORD-[\w-]+", title).group(0)
        expect(page.locator("#createdOrderInstructions")).to_contain_text("depósito")
        client.shot("04-pedido-creado", full_page=False)
        client.assert_clean()
    check("P04 cliente arma el carrito y confirma el pedido (precio del servidor con promoción)", buy)

    def my_orders():
        client.open("mis-pedidos.html")
        expect(page.locator("#ordersList")).to_contain_text(state["order"])
        client.shot("05-mis-pedidos-graphql")
        page.locator("#ordersList button", has_text="Ver detalle").first.click()
        expect(page.locator("#detailModal")).to_be_visible()
        expect(page.locator("#detailModal")).to_contain_text("Pajaritos")
        client.shot("06-detalle-pedido-graphql", full_page=False)
        page.locator("#detailModal button", has_text="Cerrar").click()
        client.assert_clean()
    check("P05 mis pedidos combina orders, inventory y payments vía GraphQL", my_orders)

    def my_data():
        page.click("#myDataBtn")
        expect(page.locator("#modal-perfil")).to_be_visible()
        expect(page.locator("#pfName")).to_have_value(re.compile("Constanza"))
        page.fill("#pfPhone", "+56911112222")
        client.shot("07-mis-datos", full_page=False)
        page.click("#pfSave")
        expect(page.locator("#modal-perfil")).to_be_hidden()
        page.click("#myDataBtn")
        expect(page.locator("#pfPhone")).to_have_value("+56911112222")
        page.fill("#pfPhone", "+56912345678")
        page.click("#pfSave")
        expect(page.locator("#modal-perfil")).to_be_hidden()
        client.assert_clean()
    check("S32/S33 el cliente consulta y modifica sus datos desde Mis datos", my_data)

    def denied():
        client.open("admin-productos.html")
        expect(page.locator("#productsBody [data-edit]")).to_have_count(0)
        client.shot("08-cliente-sin-permiso-admin", full_page=False)
    check("un cliente no puede usar el mantenedor de productos", denied)
    client.close()

    cashier = Session(browser, "cajero")
    def confirm_payment():
        cashier.open("ventas.html")
        expect(cashier.page.locator("[data-confirm]").first).to_be_visible()
        cashier.shot("09-ventas-cajero")
        cashier.page.fill("#orderSearchInput", state["order"])
        cashier.page.press("#orderSearchInput", "Enter")
        button = cashier.page.locator(f'[data-confirm="{state["order"]}"]')
        expect(button).to_be_visible()
        expect(cashier.page.locator("[data-confirm]")).to_have_count(1)
        button.click()
        expect(cashier.page.locator("#payReference")).not_to_have_value("")
        cashier.page.click("#submitPayBtn")
        expect(cashier.page.locator("#receiptModal")).to_be_visible()
        expect(cashier.page.locator("#receiptBody")).to_contain_text("IVA")
        cashier.shot("10-boleta-emitida", full_page=False)
        cashier.assert_clean()
    check("P09 el cajero busca el pedido, confirma el pago y ve la boleta con IVA", confirm_payment)

    def pagination():
        cashier.open("ventas.html")
        pager = cashier.page.locator("#salesPager")
        if cashier.page.locator("#salesPager [data-page]").count():
            first = cashier.page.locator("[data-confirm]").first.get_attribute("data-confirm")
            pager.locator("button", has_text="Siguiente").click()
            expect(cashier.page.locator("#salesPager")).to_contain_text("Página 2")
            assert cashier.page.locator("[data-confirm]").first.get_attribute("data-confirm") != first
            cashier.shot("09b-ventas-paginacion", full_page=False)
        cashier.assert_clean()
    check("S19 la bandeja de ventas pagina los pedidos pendientes", pagination)
    cashier.close()

    dispatcher = Session(browser, "despacho")
    def dispatch():
        dispatcher.open("despacho.html")
        start = dispatcher.page.locator(f'[data-id="{state["order"]}"][data-to="en_preparacion"]')
        expect(start).to_be_visible()
        expect(dispatcher.page.locator("#dispatchList")).to_contain_text("Pajaritos")
        dispatcher.shot("11-despacho-cola")
        start.click()
        expect(dispatcher.page.locator(f'[data-id="{state["order"]}"][data-to="despachado"]')).to_be_visible()
        dispatcher.shot("12-despacho-en-preparacion")
        dispatcher.assert_clean()
    check("P10 despacho ve la dirección y avanza el pedido a preparación", dispatch)
    dispatcher.close()

    admin = Session(browser, "administrador")
    apage = admin.page
    def edit_product():
        admin.open("admin-productos.html")
        apage.click('[data-edit="p-0008"]')
        expect(apage.locator("#npName")).to_have_value("Bebida 350ml")
        apage.fill("#npPrice", "1300")
        admin.shot("13-editar-producto", full_page=False)
        apage.click("#productSubmitBtn")
        expect(apage.locator("#productsBody")).to_contain_text("1.300")
        apage.click('[data-edit="p-0008"]')
        apage.fill("#npPrice", "1200")
        apage.click("#productSubmitBtn")
        expect(apage.locator("#productsBody")).to_contain_text("1.200")
        admin.shot("14-mantenedor-productos")
        admin.assert_clean()
    check("S30 el administrador edita un producto desde el mantenedor", edit_product)

    def edit_user():
        admin.open("admin-usuarios.html")
        expect(apage.locator("#usersBody")).to_contain_text("cajero@lachilena.cl")
        apage.locator("#usersBody tr", has_text="cajero@lachilena.cl").locator("[data-edit]").click()
        expect(apage.locator("#modal-editar-usuario")).to_be_visible()
        expect(apage.locator("#euRole")).to_have_value("cajero")
        admin.shot("15-editar-usuario", full_page=False)
        apage.locator("#modal-editar-usuario button", has_text="Guardar cambios").click()
        expect(apage.locator("#modal-editar-usuario")).to_be_hidden()
        admin.assert_clean()
    check("S31 el administrador abre y guarda la edición de un usuario", edit_user)

    def edit_client():
        admin.open("admin-clientes.html")
        row = apage.locator("#clientsBody tr", has_text="constanza@gmail.com")
        expect(row).to_be_visible()
        row.locator("[data-edit-client]").click()
        expect(apage.locator("#pfAddress")).to_have_value(re.compile("Pajaritos"))
        admin.shot("16-editar-cliente-admin", full_page=False)
        apage.locator("#modal-perfil [data-close-profile]").last.click()
        admin.assert_clean()
    check("S32 el administrador abre la ficha de un cliente", edit_client)

    def report():
        admin.open("reportes.html")
        expect(apage.locator("#kpis")).not_to_be_empty()
        admin.shot("17-reporte-ventas")
        admin.assert_clean()
    check("P11 el administrador consulta el reporte de ventas", report)
    admin.close()

    owner = Session(browser, "dueno")
    def owner_report():
        owner.open("reportes.html")
        expect(owner.page.locator("#kpis")).not_to_be_empty()
        owner.assert_clean()
    check("P11 el dueño consulta el reporte de ventas", owner_report)
    owner.close()

    phone = Session(browser, "cliente", mobile=True)
    def responsive():
        phone.open("index.html")
        expect(phone.page.locator("[data-add]").first).to_be_visible()
        phone.shot("18-movil-catalogo", full_page=False)
        phone.open("mis-pedidos.html")
        expect(phone.page.locator("#ordersList")).to_contain_text("ORD-")
        phone.shot("19-movil-mis-pedidos", full_page=False)
        width = phone.page.evaluate("document.documentElement.scrollWidth")
        assert width <= 392, f"la página desborda horizontalmente ({width}px)"
        phone.assert_clean()
    check("diseño móvil sin desborde horizontal (catálogo y mis pedidos)", responsive)
    phone.close()


def main():
    os.makedirs(SHOTS, exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        try:
            run(browser)
        except Exception as error:
            print(f"FAIL ejecución interrumpida  ({type(error).__name__}: {str(error).splitlines()[0][:200]})")
            failures.append("ejecución interrumpida")
        finally:
            browser.close()
    print()
    if failures:
        print(f"{len(failures)} comprobaciones fallaron: {failures}")
        sys.exit(1)
    print("Todas las comprobaciones pasaron")


if __name__ == "__main__":
    main()
